import {
  authorizeAccountRequest,
  readAccountBody,
  accountError,
} from "@/lib/account-request";
import { publishedArticle } from "@/lib/published-articles";
import { isCommentId } from "@/lib/community-policy";
import {
  communityResponse,
  communityJson,
  communityMutation,
  CommunityError,
} from "@/lib/community";

export const runtime = "nodejs";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ articleId: string; commentId: string }> },
) {
  return communityResponse(async () => {
    const { articleId, commentId } = await context.params;
    if (!publishedArticle(articleId) || !isCommentId(commentId))
      return accountError("评论不存在。", 404);
    const authorization = await authorizeAccountRequest(request);
    if (authorization.error) return authorization.error;
    const body = await readAccountBody(request).catch(() => null);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length
    )
      return accountError("请求格式不正确。", 400);
    const { user, session } = authorization.session;
    await communityMutation(
      user.id,
      session.id,
      "delete-comment",
      30,
      async (tx) => {
        const result = await tx.comment.updateMany({
          where: { id: commentId, articleId, userId: user.id },
          data: { body: "", deletedAt: new Date() },
        });
        if (!result.count)
          throw new CommunityError(404, "评论不存在或不属于当前账号。");
      },
    );
    return communityJson({ message: "评论已删除。" });
  });
}
