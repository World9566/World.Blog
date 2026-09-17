import {
  authorizeAccountRequest,
  readAccountBody,
  accountError,
} from "@/lib/account-request";
import { readSession } from "@/lib/session";
import { publishedArticle } from "@/lib/published-articles";
import { isCommentId, parseComment } from "@/lib/community-policy";
import {
  communityResponse,
  communityJson,
  communityMutation,
  commentPage,
  CommunityError,
} from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ articleId: string }> };

export async function GET(request: Request, context: Context) {
  return communityResponse(async () => {
    const { articleId } = await context.params;
    if (!publishedArticle(articleId))
      return accountError("文章暂不可用。", 404);
    const params = new URL(request.url).searchParams;
    const parentId = params.get("parentId"),
      cursor = params.get("cursor");
    if (
      (parentId !== null && !isCommentId(parentId)) ||
      (cursor !== null && !isCommentId(cursor))
    )
      return accountError("评论位置不正确。", 400);
    const session = await readSession(request.headers);
    return communityJson(
      await commentPage(articleId, parentId, cursor, session?.user.id),
    );
  });
}

export async function POST(request: Request, context: Context) {
  return communityResponse(async () => {
    const { articleId } = await context.params;
    if (!publishedArticle(articleId))
      return accountError("文章暂不可用。", 404);
    const authorization = await authorizeAccountRequest(request);
    if (authorization.error) return authorization.error;
    const input = parseComment(
      await readAccountBody(request).catch(() => null),
    );
    if (!input.ok) return accountError(input.message, 400);
    const { user, session } = authorization.session;
    const result = await communityMutation(
      user.id,
      session.id,
      "comment",
      5,
      async (tx) => {
        const existing = await tx.comment.findUnique({
          where: { id: input.requestId },
        });
        if (existing) {
          if (
            existing.userId !== user.id ||
            existing.articleId !== articleId ||
            existing.parentId !== input.parentId ||
            existing.body !== input.body ||
            existing.deletedAt
          )
            throw new CommunityError(409, "这次评论已发生变化，请刷新后重试。");
          return { id: existing.id, repeated: true };
        }
        if (input.parentId) {
          await tx.$queryRaw`SELECT id FROM "comment" WHERE id = ${input.parentId} FOR UPDATE`;
          const parent = await tx.comment.findFirst({
            where: {
              id: input.parentId,
              articleId,
              parentId: null,
              deletedAt: null,
              status: "PUBLISHED",
            },
            select: { id: true },
          });
          if (!parent)
            throw new CommunityError(404, "这条评论已不可回复，请刷新后查看。");
        }
        await tx.comment.create({
          data: {
            id: input.requestId,
            articleId,
            userId: user.id,
            parentId: input.parentId,
            body: input.body,
          },
        });
        return { id: input.requestId, repeated: false };
      },
    );
    return communityJson(
      { id: result.id, message: "评论已发布。" },
      result.repeated ? 200 : 201,
    );
  });
}
