import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { readSession } from "./session";
import { authorizeAccountRequest } from "./account-request";
import { isBanned } from "./account-policy";
import { CommunityError } from "./community";
import { publishedArticles } from "./published-articles";
import {
  ADMIN_PAGE_SIZE,
  type AdminAction,
  type AdminQuery,
  type AdminComment,
} from "./admin-policy";

export type AdminActor = { id: string; sessionId: string } | null;
export async function requireAdminRequest(request: Request, write = false) {
  if (write) {
    const authorization = await authorizeAccountRequest(request);
    if (authorization.error) return authorization;
    if (authorization.session.user.role !== "admin")
      throw new CommunityError(403, "你没有管理权限。");
    return authorization;
  }
  const session = await readSession(request.headers);
  if (!session) throw new CommunityError(401, "请先登录。");
  if (session.user.role !== "admin")
    throw new CommunityError(403, "你没有管理权限。");
  return { session };
}

// All administrative writes, including the maintenance CLI, share this lock.
// The permission check runs again after waiting, preventing stale role writes.
export async function adminMutation<T>(
  actor: AdminActor,
  work: (tx: Prisma.TransactionClient, actorName: string) => Promise<T>,
) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(9566, 1)::text`;
      let actorName = "服务器管理员";
      if (actor) {
        await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${actor.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "session" WHERE id = ${actor.sessionId} AND "userId" = ${actor.id} FOR SHARE`;
        const user = await tx.user.findUnique({ where: { id: actor.id } });
        const session = await tx.session.findFirst({
          where: {
            id: actor.sessionId,
            userId: actor.id,
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        });
        if (!user || !session || isBanned(user))
          throw new CommunityError(401, "登录已失效，请重新登录。");
        if (user.role !== "admin")
          throw new CommunityError(403, "管理权限已变更，请刷新后重试。");
        actorName = user.name;
        const key = { userId_action: { userId: actor.id, action: "admin" } };
        const limit = await tx.interactionLimit.findUnique({ where: key });
        const now = new Date();
        const reset =
          !limit || now.getTime() - limit.startedAt.getTime() >= 60000;
        if (!reset && limit.count >= 60)
          throw new CommunityError(429, "操作有些频繁，请一分钟后再试。");
        await tx.interactionLimit.upsert({
          where: key,
          create: {
            userId: actor.id,
            action: "admin",
            startedAt: now,
            count: 1,
          },
          update: reset
            ? { startedAt: now, count: 1 }
            : { count: { increment: 1 } },
        });
      }
      return work(tx, actorName);
    },
    { maxWait: 5000, timeout: 10000 },
  );
}

export async function changeUserAccess(
  actor: AdminActor,
  targetId: string,
  action: AdminAction,
  reason: string,
) {
  return adminMutation(actor, async (tx, actorName) => {
    if (!action.startsWith("user."))
      throw new CommunityError(400, "用户操作不正确。");
    if (actor?.id === targetId)
      throw new CommunityError(409, "不能在后台修改自己的角色或停用状态。");
    await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${targetId} FOR UPDATE`;
    const target = await tx.user.findUnique({ where: { id: targetId } });
    if (!target) throw new CommunityError(404, "用户不存在。");
    const before = { role: target.role, banned: isBanned(target) };
    const after = {
      role:
        action === "user.promote"
          ? "admin"
          : action === "user.demote"
            ? "user"
            : before.role,
      banned:
        action === "user.ban"
          ? true
          : action === "user.unban"
            ? false
            : before.banned,
    };
    if (before.role === after.role && before.banned === after.banned)
      return { changed: false, message: "账号已处于该状态。" };
    if (after.role === "admin" && after.banned && action === "user.promote")
      throw new CommunityError(409, "请先恢复账号，再授予管理权限。");
    if (
      before.role === "admin" &&
      !before.banned &&
      (after.role !== "admin" || after.banned)
    ) {
      const activeAdmins = await tx.user.count({
        where: {
          role: "admin",
          OR: [
            { banned: false },
            { banned: true, banExpires: { lte: new Date() } },
          ],
        },
      });
      if (activeAdmins <= 1)
        throw new CommunityError(409, "至少需要保留一位正常使用的管理员。");
    }
    await tx.user.update({
      where: { id: targetId },
      data: {
        role: after.role,
        banned: after.banned,
        ...(action === "user.ban" || action === "user.unban" || !after.banned
          ? { banReason: after.banned ? reason : null, banExpires: null }
          : {}),
      },
    });
    await tx.session.deleteMany({ where: { userId: targetId } });
    await tx.adminAudit.create({
      data: {
        actorId: actor?.id,
        actorName,
        source: actor ? "web" : "cli",
        action,
        targetType: "user",
        targetId,
        targetLabel: target.githubUsername
          ? `${target.name} (@${target.githubUsername})`
          : target.name,
        reason,
        before,
        after,
      },
    });
    return { changed: true, message: "账号状态已更新，原有登录已退出。" };
  });
}

export async function moderateComment(
  actor: Exclude<AdminActor, null>,
  targetId: string,
  action: AdminAction,
  reason: string,
) {
  return adminMutation(actor, async (tx, actorName) => {
    if (!action.startsWith("comment."))
      throw new CommunityError(400, "评论操作不正确。");
    await tx.$queryRaw`SELECT id FROM "comment" WHERE id = ${targetId} FOR UPDATE`;
    const target = await tx.comment.findUnique({ where: { id: targetId } });
    if (!target) throw new CommunityError(404, "评论不存在。");
    if (target.deletedAt)
      throw new CommunityError(409, "评论已删除，无法再次审核或恢复。");
    const before = {
      status: target.status,
      reviewed: !!target.reviewedAt,
      deleted: false,
    };
    const status =
      action === "comment.hide"
        ? "HIDDEN"
        : action === "comment.delete"
          ? target.status
          : "PUBLISHED";
    if (action === "comment.restore" && target.status !== "HIDDEN")
      throw new CommunityError(409, "只有隐藏的评论可以恢复。");
    if (action === "comment.approve" && target.status === "HIDDEN")
      throw new CommunityError(409, "请使用恢复操作重新公开这条评论。");
    if (
      target.status === status &&
      target.reviewedAt &&
      action !== "comment.delete"
    )
      return { changed: false, message: "评论已处于该状态。" };
    await tx.comment.update({
      where: { id: targetId },
      data: {
        status,
        reviewedAt: new Date(),
        ...(action === "comment.delete"
          ? { body: "", deletedAt: new Date() }
          : {}),
      },
    });
    const after = {
      status,
      reviewed: true,
      deleted: action === "comment.delete",
    };
    const article = publishedArticles.find(
      (item) => item.id === target.articleId,
    );
    await tx.adminAudit.create({
      data: {
        actorId: actor.id,
        actorName,
        source: "web",
        action,
        targetType: "comment",
        targetId,
        targetLabel: article?.title || "已撤下文章的评论",
        reason,
        before,
        after,
      },
    });
    return {
      changed: true,
      message:
        action === "comment.delete" ? "评论正文已删除。" : "评论状态已更新。",
    };
  });
}

const pageOptions = (query: AdminQuery) => ({
  skip: (query.page - 1) * ADMIN_PAGE_SIZE,
  take: ADMIN_PAGE_SIZE,
});
const pageResult = <T>(items: T[], total: number, query: AdminQuery) => ({
  items,
  total,
  page: query.page,
  pages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
});

export async function listAdminUsers(query: AdminQuery, viewer: string) {
  const now = new Date();
  const where: Prisma.UserWhereInput = {
    AND: [
      ...(query.q
        ? [
            {
              OR: [
                { name: { contains: query.q, mode: "insensitive" as const } },
                {
                  githubUsername: {
                    contains: query.q,
                    mode: "insensitive" as const,
                  },
                },
                {
                  accounts: {
                    some: { providerId: "github", accountId: query.q },
                  },
                },
              ],
            },
          ]
        : []),
      ...(query.status === "admin"
        ? [{ role: "admin" }]
        : query.status === "banned"
          ? [
              {
                banned: true,
                OR: [{ banExpires: null }, { banExpires: { gt: now } }],
              },
            ]
          : query.status === "active"
            ? [{ OR: [{ banned: false }, { banExpires: { lte: now } }] }]
            : []),
    ],
  };
  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pageOptions(query),
      select: {
        id: true,
        name: true,
        image: true,
        githubUsername: true,
        role: true,
        banned: true,
        banReason: true,
        banExpires: true,
        createdAt: true,
        accounts: {
          where: { providerId: "github" },
          select: { accountId: true },
          take: 1,
        },
        _count: { select: { comments: { where: { deletedAt: null } } } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  return pageResult(
    rows.map(({ accounts, _count, banExpires, ...row }) => ({
      ...row,
      banned: isBanned({ banned: row.banned, banExpires }),
      githubId: accounts[0]?.accountId || null,
      comments: _count.comments,
      createdAt: row.createdAt.toISOString(),
      self: row.id === viewer,
    })),
    total,
    query,
  );
}

export async function listAdminComments(query: AdminQuery) {
  const where: Prisma.CommentWhereInput = {
    AND: [
      ...(query.q
        ? [
            {
              OR: [
                { body: { contains: query.q, mode: "insensitive" as const } },
                {
                  user: {
                    name: { contains: query.q, mode: "insensitive" as const },
                  },
                },
                {
                  articleId: {
                    in: publishedArticles
                      .filter((article) =>
                        article.title
                          .toLowerCase()
                          .includes(query.q.toLowerCase()),
                      )
                      .map((article) => article.id),
                  },
                },
              ],
            },
          ]
        : []),
      ...(query.status === "deleted"
        ? [{ deletedAt: { not: null } }]
        : query.status === "all"
          ? []
          : [
              { deletedAt: null },
              query.status === "pending"
                ? { status: "PUBLISHED" as const, reviewedAt: null }
                : query.status === "hidden"
                  ? { status: "HIDDEN" as const }
                  : { status: "PUBLISHED" as const, reviewedAt: { not: null } },
            ]),
    ],
  };
  const [rows, total] = await prisma.$transaction([
    prisma.comment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pageOptions(query),
      select: {
        id: true,
        body: true,
        status: true,
        reviewedAt: true,
        deletedAt: true,
        parentId: true,
        articleId: true,
        createdAt: true,
        user: { select: { name: true, image: true } },
        parent: { select: { status: true } },
      },
    }),
    prisma.comment.count({ where }),
  ]);
  const items: AdminComment[] = rows.map((row) => {
    const article = publishedArticles.find((item) => item.id === row.articleId);
    return {
      id: row.id,
      body: row.deletedAt ? "" : row.body,
      author: row.user,
      article: {
        title: article?.title || "文章已撤下",
        href: article ? `/articles/${article.slug}#comments` : null,
      },
      parentId: row.parentId,
      parentHidden: !!row.parent && row.parent.status !== "PUBLISHED",
      createdAt: row.createdAt.toISOString(),
      status: row.deletedAt
        ? "deleted"
        : row.status === "HIDDEN"
          ? "hidden"
          : !row.reviewedAt
            ? "pending"
            : "published",
      isPublic:
        !!article &&
        !row.deletedAt &&
        row.status === "PUBLISHED" &&
        (!row.parent || row.parent.status === "PUBLISHED"),
    };
  });
  return pageResult(items, total, query);
}

export async function listAdminAudit(query: AdminQuery) {
  const where: Prisma.AdminAuditWhereInput = {
    ...(query.status !== "all" ? { targetType: query.status } : {}),
    ...(query.q
      ? {
          OR: ["actorName", "targetLabel", "reason"].map((key) => ({
            [key]: { contains: query.q, mode: "insensitive" },
          })),
        }
      : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.adminAudit.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pageOptions(query),
      select: {
        id: true,
        actorName: true,
        source: true,
        action: true,
        targetLabel: true,
        reason: true,
        createdAt: true,
      },
    }),
    prisma.adminAudit.count({ where }),
  ]);
  return pageResult(
    rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    total,
    query,
  );
}
