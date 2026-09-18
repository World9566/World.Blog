import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { isBanned } from "./account-policy";
import { accountError, privateHeaders } from "./account-request";
import { getArticles } from "./content";
import { publicComment, publicThread } from "./comment-visibility";
import {
  ACTIVITY_PAGE_SIZE,
  COMMENT_PAGE_SIZE,
  type CommentView,
} from "./community-policy";

export class CommunityError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function communityResponse(work: () => Promise<Response>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof CommunityError) {
      const response = accountError(error.message, error.status);
      if (error.status === 429) response.headers.set("Retry-After", "60");
      return response;
    }
    console.error(
      "Community request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return accountError("暂时无法完成操作，请稍后重试。", 503);
  }
}

export const communityJson = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: privateHeaders });

// Serialize each user's writes with the same row lock used by role/ban updates.
// Recheck both the session and user after acquiring it, closing revoke/ban races.
export async function communityMutation<T>(
  userId: string,
  sessionId: string,
  action: string,
  max: number,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "session" WHERE id = ${sessionId} AND "userId" = ${userId} FOR SHARE`;
    const [user, session] = await Promise.all([
      tx.user.findUnique({
        where: { id: userId },
        select: { banned: true, banExpires: true },
      }),
      tx.session.findFirst({
        where: { id: sessionId, userId, expiresAt: { gt: new Date() } },
        select: { id: true },
      }),
    ]);
    if (!user || !session || isBanned(user))
      throw new CommunityError(401, "登录已失效，请重新登录。");
    const now = new Date();
    const key = { userId_action: { userId, action } };
    const limit = await tx.interactionLimit.findUnique({ where: key });
    if (
      limit &&
      now.getTime() - limit.startedAt.getTime() < 60_000 &&
      limit.count >= max
    )
      throw new CommunityError(429, "操作有些频繁，请一分钟后再试。");
    const reset = !limit || now.getTime() - limit.startedAt.getTime() >= 60_000;
    await tx.interactionLimit.upsert({
      where: key,
      create: { userId, action, startedAt: now, count: 1 },
      update: reset
        ? { startedAt: now, count: 1 }
        : { count: { increment: 1 } },
    });
    return work(tx);
  });
}

const commentSelect = {
  id: true,
  parentId: true,
  body: true,
  createdAt: true,
  deletedAt: true,
  userId: true,
  user: { select: { name: true, image: true } },
  _count: {
    select: { replies: { where: { deletedAt: null, status: "PUBLISHED" } } },
  },
} satisfies Prisma.CommentSelect;

type SelectedComment = Prisma.CommentGetPayload<{
  select: typeof commentSelect;
}>;
function commentView(row: SelectedComment, viewer?: string): CommentView {
  return {
    id: row.id,
    parentId: row.parentId,
    body: row.deletedAt ? "" : row.body,
    createdAt: row.createdAt.toISOString(),
    deleted: !!row.deletedAt,
    mine: !row.deletedAt && row.userId === viewer,
    author: row.deletedAt ? null : row.user,
    replyCount: row._count.replies,
  };
}

export async function commentPage(
  articleId: string,
  parentId: string | null,
  cursor: string | null,
  viewer?: string,
) {
  if (parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parentId, articleId, parentId: null, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!parent) throw new CommunityError(404, "这条评论已不存在。");
  }
  const anchor = cursor
    ? await prisma.comment.findFirst({
        where: { id: cursor, articleId, parentId, ...publicThread },
        select: { id: true, createdAt: true },
      })
    : null;
  if (cursor && !anchor)
    throw new CommunityError(400, "评论位置已变化，请重新加载。");
  const direction = parentId ? "asc" : "desc";
  const compare = parentId ? "gt" : "lt";
  const rows = await prisma.comment.findMany({
    where: {
      articleId,
      parentId,
      status: "PUBLISHED",
      AND: [
        publicThread,
        parentId
          ? { deletedAt: null }
          : {
              OR: [
                { deletedAt: null },
                { replies: { some: { deletedAt: null, status: "PUBLISHED" } } },
              ],
            },
        ...(anchor
          ? [
              {
                OR: [
                  { createdAt: { [compare]: anchor.createdAt } },
                  { createdAt: anchor.createdAt, id: { [compare]: anchor.id } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ createdAt: direction }, { id: direction }],
    take: COMMENT_PAGE_SIZE + 1,
    select: commentSelect,
  });
  const items = rows.slice(0, COMMENT_PAGE_SIZE);
  return {
    items: items.map((row) => commentView(row, viewer)),
    nextCursor: rows.length > COMMENT_PAGE_SIZE ? items.at(-1)!.id : null,
  };
}

export async function interactionState(articleId: string, userId?: string) {
  const [likes, comments, liked, bookmarked] = await Promise.all([
    prisma.articleLike.count({ where: { articleId } }),
    prisma.comment.count({ where: { articleId, ...publicComment } }),
    userId
      ? prisma.articleLike.findUnique({
          where: { userId_articleId: { userId, articleId } },
          select: { userId: true },
        })
      : null,
    userId
      ? prisma.bookmark.findUnique({
          where: { userId_articleId: { userId, articleId } },
          select: { userId: true },
        })
      : null,
  ]);
  return { likes, comments, liked: !!liked, bookmarked: !!bookmarked };
}

export async function accountActivity(
  userId: string,
  kind: "bookmarks" | "comments",
  page: number,
) {
  const publishedArticles = await getArticles();
  const articleId = { in: publishedArticles.map((article) => article.id) };
  const options = {
    skip: (page - 1) * ACTIVITY_PAGE_SIZE,
    take: ACTIVITY_PAGE_SIZE + 1,
  };
  const rows =
    kind === "bookmarks"
      ? await prisma.bookmark.findMany({
          where: { userId, articleId },
          orderBy: [{ createdAt: "desc" }, { articleId: "desc" }],
          ...options,
        })
      : await prisma.comment.findMany({
          where: { userId, articleId, ...publicComment },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          ...options,
        });
  return {
    items: rows.slice(0, ACTIVITY_PAGE_SIZE).map((row) => {
      const article = publishedArticles.find(
        (article) => article.id === row.articleId,
      )!;
      return {
        id: "id" in row ? row.id : row.articleId,
        articleId: row.articleId,
        title: article.title,
        href: `/articles/${article.slug}${kind === "comments" ? "#comments" : ""}`,
        createdAt: row.createdAt.toISOString(),
        ...("body" in row ? { body: row.body } : {}),
      };
    }),
    nextPage: rows.length > ACTIVITY_PAGE_SIZE ? page + 1 : null,
  };
}
