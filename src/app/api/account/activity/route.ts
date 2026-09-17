import { readSession } from "@/lib/session";
import { accountError } from "@/lib/account-request";
import {
  accountActivity,
  communityJson,
  communityResponse,
} from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return communityResponse(async () => {
    const session = await readSession(request.headers);
    if (!session) return accountError("登录已失效，请重新登录。", 401);
    const params = new URL(request.url).searchParams;
    const kind = params.get("kind") || "bookmarks";
    const page = params.get("page") || "1";
    if (
      !["bookmarks", "comments"].includes(kind) ||
      !/^[1-9]\d{0,3}$/.test(page)
    )
      return accountError("页码或内容类型不正确。", 400);
    return communityJson(
      await accountActivity(
        session.user.id,
        kind as "bookmarks" | "comments",
        Number(page),
      ),
    );
  });
}
