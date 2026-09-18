import { timingSafeEqual } from "node:crypto";
import { refreshContent, contentStatus } from "@/lib/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by the content deploy script over the internal Docker network so a
// release switch is picked up and compiled before readers arrive. The token
// is shared through the compose environment and never leaves the network.
function authorized(request: Request): boolean {
  const expected = process.env.CONTENT_REFRESH_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const value = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const reference = Buffer.from(expected);
  return value.length === reference.length && timingSafeEqual(value, reference);
}

export async function GET() {
  return Response.json(contentStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!authorized(request))
    return Response.json({ error: "未授权。" }, { status: 401 });
  const result = await refreshContent();
  if (result.errors.length)
    return Response.json(
      { error: "内容加载失败。", detail: result.errors },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(
    { message: "内容已刷新。", articles: result.articles },
    { headers: { "Cache-Control": "no-store" } },
  );
}
