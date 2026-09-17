import {
  requireAdminRequest,
  changeUserAccess,
  moderateComment,
} from "@/lib/admin";
import { parseAdminAction } from "@/lib/admin-policy";
import { communityResponse, communityJson } from "@/lib/community";
import { accountError, readAccountBody } from "@/lib/account-request";
import { isCommentId } from "@/lib/community-policy";

export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ section: string; id: string }> },
) {
  return communityResponse(async () => {
    const auth = await requireAdminRequest(request, true);
    if (auth.error) return auth.error;
    const { section, id } = await context.params;
    if (
      (section !== "users" && section !== "comments") ||
      !id ||
      id.length > 128 ||
      (section === "comments" && !isCommentId(id))
    )
      return accountError("操作对象不存在。", 404);
    const input = parseAdminAction(
      await readAccountBody(request).catch(() => null),
      section === "users" ? "user" : "comment",
    );
    if (!input.ok) return accountError(input.message, 400);
    const current = auth.session!;
    const actor = { id: current.user.id, sessionId: current.session.id };
    return communityJson(
      section === "users"
        ? await changeUserAccess(actor, id, input.action, input.reason)
        : await moderateComment(actor, id, input.action, input.reason),
    );
  });
}
