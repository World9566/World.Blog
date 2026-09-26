import { createHash } from "node:crypto";
import { readPublishedCover } from "@/lib/content";

export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const cover = await readPublishedCover(`/media/${path.join("/")}`).catch(
    () => null,
  );
  if (!cover)
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  const etag = `"${createHash("sha256").update(cover.bytes).digest("hex")}"`;
  const headers = {
    "Content-Type": cover.contentType,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    // Revalidate publication and bytes on every reuse; shared caches must not
    // keep serving an image after its article has been unpublished.
    "Cache-Control": "private, no-cache, must-revalidate",
    ETag: etag,
  };
  const matches = request.headers
    .get("if-none-match")
    ?.split(",")
    .some((value) => {
      const candidate = value.trim().replace(/^W\//, "");
      return candidate === "*" || candidate === etag;
    });
  if (matches) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(cover.bytes), {
    headers,
  });
}
