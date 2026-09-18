import {
  authorizeAccountRequest,
  readAccountBody,
  accountError,
} from "@/lib/account-request";
import { readSession } from "@/lib/session";
import { publishedArticle } from "@/lib/content";
import { parseReaction } from "@/lib/community-policy";
import {
  communityResponse,
  communityJson,
  communityMutation,
  interactionState,
  commentPage,
} from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ articleId: string }> };

export async function GET(request: Request, context: Context) {
  return communityResponse(async () => {
    const { articleId } = await context.params;
    if (!(await publishedArticle(articleId)))
      return accountError("文章暂不可用。", 404);
    const session = await readSession(request.headers);
    const [state, comments] = await Promise.all([
      interactionState(articleId, session?.user.id),
      commentPage(articleId, null, null, session?.user.id),
    ]);
    return communityJson({ state, comments });
  });
}

export async function PUT(request: Request, context: Context) {
  return communityResponse(async () => {
    const { articleId } = await context.params;
    if (!(await publishedArticle(articleId)))
      return accountError("文章暂不可用。", 404);
    const authorization = await authorizeAccountRequest(request);
    if (authorization.error) return authorization.error;
    const input = parseReaction(
      await readAccountBody(request).catch(() => null),
    );
    if (!input) return accountError("操作格式不正确。", 400);
    const { user, session } = authorization.session;
    await communityMutation(user.id, session.id, "reaction", 60, async (tx) => {
      const where = { userId: user.id, articleId };
      if (input.kind === "like") {
        if (input.active)
          await tx.articleLike.createMany({
            data: where,
            skipDuplicates: true,
          });
        else await tx.articleLike.deleteMany({ where });
      } else {
        if (input.active)
          await tx.bookmark.createMany({ data: where, skipDuplicates: true });
        else await tx.bookmark.deleteMany({ where });
      }
    });
    return communityJson({ state: await interactionState(articleId, user.id) });
  });
}
