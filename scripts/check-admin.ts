import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { authOrigin } from "../src/lib/auth-config";
import { changeUserAccess } from "../src/lib/admin";
import { publishedArticles } from "../src/lib/published-articles";

async function main() {
  const base = process.env.CHECK_BASE_URL || "http://127.0.0.1:3000";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error(
      "Admin checks only run against a local development server.",
    );
  const prefix = `qa_admin_${randomUUID()}`;
  const ids = [0, 1, 2].map((index) => `${prefix}_${index}`);
  const commentIds: string[] = [];
  const cookies: string[] = [];
  const sessionIds: string[] = [];
  const context = await auth.$context;
  const article = publishedArticles[0];
  assert.ok(article);
  const path = `/api/articles/${article.id}`;
  const baselineAdmins = await prisma.user.count({
    where: {
      role: "admin",
      OR: [{ banned: false }, { banExpires: { lte: new Date() } }],
    },
  });
  let checks = 0;
  const passed = (message: string) => {
    checks++;
    console.log(`PASS ${message}`);
  };
  async function mint(index: number) {
    const token = randomBytes(32).toString("hex");
    const signed = `${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64")}`;
    cookies[index] =
      `${context.authCookies.sessionToken.name}=${encodeURIComponent(signed)}`;
    sessionIds[index] = randomUUID();
    await prisma.session.create({
      data: {
        id: sessionIds[index],
        token,
        userId: ids[index],
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  }
  async function request(
    url: string,
    user: number | null = null,
    method = "GET",
    body?: unknown,
    origin: string | null = authOrigin,
  ) {
    return fetch(new URL(url, base), {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
      headers: {
        ...(user !== null ? { cookie: cookies[user] } : {}),
        ...(method !== "GET"
          ? {
              "Content-Type": "application/json",
              ...(origin ? { Origin: origin } : {}),
            }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  const mutate = (
    type: "users" | "comments",
    id: string,
    action: string,
    user = 0,
    reason = "集成测试操作",
  ) => request(`/api/admin/${type}/${id}`, user, "POST", { action, reason });
  async function json(url: string, user: number | null = null) {
    const response = await request(url, user);
    assert.equal(response.status, 200, `GET ${url}`);
    return response.json();
  }
  async function post(body: string, parentId?: string) {
    const id = randomUUID();
    commentIds.push(id);
    const response = await request(`${path}/comments`, 2, "POST", {
      body,
      parentId,
      requestId: id,
    });
    return { id, response };
  }
  try {
    for (let index = 0; index < ids.length; index++) {
      await prisma.user.create({
        data: {
          id: ids[index],
          name: `${prefix}_${index}`,
          email: `${ids[index]}@example.invalid`,
          emailVerified: true,
          role: index === 0 ? "admin" : "user",
          accounts: {
            create: {
              id: randomUUID(),
              providerId: "github",
              accountId: `${prefix}_github_${index}`,
            },
          },
        },
      });
      await mint(index);
    }
    for (const section of ["overview", "users", "comments", "audit"]) {
      const denied = await request(`/api/admin/${section}`);
      assert.equal(denied.status, 401);
      assert.match(
        denied.headers.get("cache-control") || "",
        /private, no-store/,
      );
      assert.equal((await request(`/api/admin/${section}`, 2)).status, 403);
    }
    assert.equal((await request("/admin")).status, 307);
    assert.match(
      (await request("/admin")).headers.get("location") || "",
      /login\?next=%2Fadmin/,
    );
    assert.equal(
      (await request("/admin", 2)).headers.get("location"),
      "/account",
    );
    assert.equal((await request("/admin", 0)).status, 200);
    assert.equal(
      (await mutate("users", ids[2], "user.promote", 2)).status,
      403,
    );
    passed(
      "admin pages and every collection reject anonymous and ordinary users",
    );

    for (const origin of [null, "https://evil.example"])
      assert.equal(
        (
          await request(
            `/api/admin/users/${ids[2]}`,
            0,
            "POST",
            { action: "user.ban", reason: "测试原因" },
            origin,
          )
        ).status,
        403,
      );
    for (const body of [
      { action: "user.ban", reason: "测试原因", actorId: ids[2] },
      { action: "comment.delete", reason: "测试原因" },
      { action: "user.ban", reason: "x".repeat(9000) },
    ])
      assert.equal(
        (await request(`/api/admin/users/${ids[2]}`, 0, "POST", body)).status,
        400,
      );
    assert.equal((await request("/api/admin/users?page=0", 0)).status, 400);
    const users = await json(`/api/admin/users?q=${prefix}`, 0);
    assert.equal(users.total, 3);
    assert.ok(!JSON.stringify(users).includes("@example.invalid"));
    assert.ok(!JSON.stringify(users).includes("token"));
    assert.equal(
      (await json(`/api/admin/users?q=${prefix}_github_1`, 0)).total,
      1,
    );
    passed(
      "admin mutations enforce CSRF, payload boundaries, and private user-field selection",
    );

    for (const action of ["user.ban", "user.demote"])
      assert.equal((await mutate("users", ids[0], action)).status, 409);
    if (baselineAdmins === 0) {
      for (const action of ["user.ban", "user.demote"] as const)
        await assert.rejects(
          changeUserAccess(null, ids[0], action, "最后管理员保护测试"),
          (error: unknown) => (error as { status: number }).status === 409,
        );
      passed(
        "self changes and CLI removal of the last active administrator are blocked",
      );
    } else {
      // Existing administrator accounts are never altered to manufacture this case.
      passed(
        "self changes are blocked; last-admin integration case needs an empty admin baseline",
      );
    }
    assert.equal((await mutate("users", ids[1], "user.promote")).status, 200);
    assert.equal((await request("/api/admin/overview", 1)).status, 401);
    assert.equal(await prisma.session.count({ where: { userId: ids[1] } }), 0);
    await mint(1);
    assert.equal((await request("/api/admin/overview", 1)).status, 200);
    assert.equal((await mutate("users", ids[2], "user.ban")).status, 200);
    assert.equal((await request("/api/account/activity", 2)).status, 401);
    assert.equal(
      (await json(`/api/admin/users?q=${prefix}&status=banned`, 0)).total,
      1,
    );
    assert.equal((await mutate("users", ids[2], "user.promote")).status, 409);
    assert.equal((await mutate("users", ids[2], "user.unban")).status, 200);
    assert.equal((await request("/api/account/activity", 2)).status, 401);
    await mint(2);
    passed(
      "role changes and bans revoke all target sessions; recovery requires a fresh login",
    );

    const initial = await json(`${path}/community`);
    const secretBody = `${prefix} <script>notExecutable()</script>`;
    const root = await post(secretBody);
    assert.equal(root.response.status, 201);
    const reply = await post(`${prefix} reply`, root.id);
    assert.equal(reply.response.status, 201);
    assert.equal(
      (await json(`${path}/community`)).state.comments,
      initial.state.comments + 2,
    );
    const pending = await json(
      `/api/admin/comments?q=${prefix}&status=pending`,
      0,
    );
    assert.equal(pending.total, 2);
    assert.equal(
      pending.items.find((row: { id: string }) => row.id === root.id).isPublic,
      true,
    );
    assert.equal(
      (await mutate("comments", root.id, "comment.approve")).status,
      200,
    );
    assert.equal(
      (await json(`/api/admin/comments?q=${prefix}&status=pending`, 0)).total,
      1,
    );
    const auditsAfterApproval = await prisma.adminAudit.count({
      where: { targetId: root.id },
    });
    assert.equal(
      (await (await mutate("comments", root.id, "comment.approve")).json())
        .changed,
      false,
    );
    assert.equal(
      await prisma.adminAudit.count({ where: { targetId: root.id } }),
      auditsAfterApproval,
    );
    passed(
      "new comments are public while unreviewed; approval is auditable and idempotent",
    );

    assert.equal(
      (await mutate("comments", root.id, "comment.hide")).status,
      200,
    );
    assert.equal(
      (await json(`${path}/community`)).state.comments,
      initial.state.comments,
    );
    assert.ok(
      !(await json(`${path}/comments`)).items.some(
        (row: { id: string }) => row.id === root.id,
      ),
    );
    assert.equal(
      (await request(`${path}/comments?parentId=${root.id}`)).status,
      404,
    );
    assert.equal((await post("hidden reply", root.id)).response.status, 404);
    assert.equal(
      (await json("/api/account/activity?kind=comments", 2)).items.length,
      0,
    );
    const hiddenReply = (
      await json(`/api/admin/comments?q=${prefix}`, 0)
    ).items.find((row: { id: string }) => row.id === reply.id);
    assert.equal(hiddenReply.parentHidden, true);
    assert.equal(hiddenReply.isPublic, false);
    assert.equal(
      (await mutate("comments", root.id, "comment.approve")).status,
      409,
    );
    assert.equal(
      (await mutate("comments", root.id, "comment.restore")).status,
      200,
    );
    assert.equal(
      (await json(`${path}/community`)).state.comments,
      initial.state.comments + 2,
    );
    assert.equal(
      (await mutate("comments", reply.id, "comment.hide")).status,
      200,
    );
    assert.equal(
      (await json(`${path}/community`)).state.comments,
      initial.state.comments + 1,
    );
    assert.equal(
      (await json(`${path}/comments?parentId=${root.id}`)).items.length,
      0,
    );
    assert.equal(
      (await mutate("comments", reply.id, "comment.restore")).status,
      200,
    );
    passed(
      "hidden threads disappear from lists, counts, direct replies, and personal history; restore recovers them",
    );

    assert.equal(
      (await mutate("comments", root.id, "comment.delete")).status,
      200,
    );
    const deleted = await prisma.comment.findUniqueOrThrow({
      where: { id: root.id },
    });
    assert.equal(deleted.body, "");
    assert.ok(deleted.deletedAt);
    assert.equal(
      (await json(`${path}/comments?parentId=${root.id}`)).items[0].id,
      reply.id,
    );
    assert.equal(
      (await mutate("comments", root.id, "comment.restore")).status,
      409,
    );
    const storedAudit = await prisma.adminAudit.findMany({
      where: { targetId: root.id },
    });
    assert.ok(storedAudit.some((row) => row.action === "comment.delete"));
    assert.ok(!JSON.stringify(storedAudit).includes(secretBody));
    assert.deepEqual(
      storedAudit.find((row) => row.action === "comment.delete")!.after,
      { status: "PUBLISHED", reviewed: true, deleted: true },
    );
    passed(
      "admin deletion erases text, retains replies, and logs status changes without copying the body",
    );

    const extra = Array.from({ length: 12 }, () => randomUUID());
    commentIds.push(...extra);
    await prisma.comment.createMany({
      data: extra.map((id) => ({
        id,
        userId: ids[2],
        articleId: article.id,
        body: `${prefix} pagination`,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      })),
    });
    const first = await json(
      `/api/admin/comments?q=${prefix}&status=pending`,
      0,
    );
    const second = await json(
      `/api/admin/comments?q=${prefix}&status=pending&page=2`,
      0,
    );
    assert.equal(first.items.length, 10);
    assert.equal(second.items.length, 2);
    assert.equal(
      new Set([...first.items, ...second.items].map((row) => row.id)).size,
      12,
    );
    const auditResponse = await request(`/api/admin/audit?q=${prefix}`, 0);
    assert.equal(auditResponse.status, 200);
    assert.match(
      auditResponse.headers.get("cache-control") || "",
      /private, no-store/,
    );
    assert.ok((await auditResponse.json()).total >= 3);
    passed(
      "moderation and audit searches are filtered, private, and consistently paginated",
    );

    const results = await Promise.all([
      mutate("users", ids[1], "user.demote", 0),
      mutate("users", ids[0], "user.demote", 1),
    ]);
    assert.equal(
      results.filter((response) => response.status === 200).length,
      1,
    );
    assert.equal(
      results.filter((response) => [401, 403].includes(response.status)).length,
      1,
    );
    assert.equal(
      await prisma.user.count({
        where: { id: { in: ids }, role: "admin", banned: false },
      }),
      1,
    );
    const removed = await prisma.user.findFirstOrThrow({
      where: { id: { in: ids.slice(0, 2) }, role: "user" },
    });
    assert.equal(
      await prisma.session.count({ where: { userId: removed.id } }),
      0,
    );
    passed(
      "concurrent administrators cannot act with a revoked role or remove each other together",
    );
    console.log(
      `Admin integration check passed: ${checks} groups. Temporary data is removed.`,
    );
  } finally {
    await prisma.adminAudit.deleteMany({
      where: {
        OR: [
          { actorId: { in: ids } },
          { targetId: { in: [...ids, ...commentIds] } },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
