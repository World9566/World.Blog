import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { authOrigin } from "../src/lib/auth-config";
import { publishedArticles } from "../src/lib/published-articles";
import { COMMENT_PAGE_SIZE } from "../src/lib/community-policy";

async function main() {
  const base = process.env.CHECK_BASE_URL || "http://127.0.0.1:3000";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error(
      "Community checks only run against a local development server.",
    );
  const [article, second] = publishedArticles;
  assert.ok(article && second, "At least two published articles are needed.");
  const path = `/api/articles/${encodeURIComponent(article.id)}`;
  const secondPath = `/api/articles/${encodeURIComponent(second.id)}`;
  const prefix = `qa_community_${randomUUID()}`;
  const ids = [`${prefix}_one`, `${prefix}_two`];
  const cookies: string[] = [];
  const context = await auth.$context;
  let checks = 0;
  const passed = (message: string) => {
    checks++;
    console.log(`PASS ${message}`);
  };
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
  async function clearLimits() {
    await prisma.interactionLimit.deleteMany({
      where: { userId: { in: ids } },
    });
  }
  async function post(
    user: number | null,
    body: string,
    parentId?: string,
    requestId = randomUUID(),
    target = path,
  ) {
    const response = await request(`${target}/comments`, user, "POST", {
      body,
      parentId,
      requestId,
    });
    return { response, json: await response.json(), id: requestId };
  }
  try {
    for (let i = 0; i < ids.length; i++) {
      const token = randomBytes(32).toString("hex");
      const signed = `${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64")}`;
      cookies.push(
        `${context.authCookies.sessionToken.name}=${encodeURIComponent(signed)}`,
      );
      await prisma.user.create({
        data: {
          id: ids[i],
          email: `${ids[i]}@example.invalid`,
          name: `讨论测试读者${i + 1}`,
          emailVerified: true,
          sessions: {
            create: {
              id: randomUUID(),
              token,
              expiresAt: new Date(Date.now() + 3600000),
            },
          },
        },
      });
    }
    const publicResponse = await request(`${path}/community`);
    assert.equal(publicResponse.status, 200);
    assert.match(publicResponse.headers.get("cache-control") || "", /no-store/);
    const baseline = await publicResponse.json();
    assert.equal(baseline.state.liked, false);
    assert.equal(baseline.state.bookmarked, false);
    assert.equal(
      (
        await request(`${path}/community`, null, "PUT", {
          kind: "like",
          active: true,
        })
      ).status,
      401,
    );
    assert.equal((await post(null, "anonymous")).response.status, 401);
    assert.equal((await request("/api/account/activity")).status, 401);
    assert.equal(
      (await request("/api/articles/qa-unpublished/community")).status,
      404,
    );
    assert.equal(
      (
        await request("/api/articles/qa-unpublished/comments", 0, "POST", {
          body: "hidden",
          requestId: randomUUID(),
        })
      ).status,
      404,
    );
    passed(
      "public reads work; mutations, private activity, and unpublished articles are guarded",
    );

    for (const origin of [null, "https://evil.example"]) {
      assert.equal(
        (
          await request(
            `${path}/community`,
            0,
            "PUT",
            { kind: "like", active: true },
            origin,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            `${path}/comments`,
            0,
            "POST",
            { body: "cross-site", requestId: randomUUID() },
            origin,
          )
        ).status,
        403,
      );
    }
    for (const body of [
      { body: "", requestId: randomUUID() },
      { body: "x".repeat(2001), requestId: randomUUID() },
      { body: "hello", requestId: randomUUID(), userId: ids[1] },
      { body: "hello", requestId: "invalid" },
      { body: "hello", requestId: randomUUID(), parentId: "invalid" },
    ])
      assert.equal(
        (await request(`${path}/comments`, 0, "POST", body)).status,
        400,
      );
    assert.equal(
      (
        await request(`${path}/community`, 0, "PUT", {
          kind: "like",
          active: true,
          userId: ids[1],
        })
      ).status,
      400,
    );
    const oversized = await request(`${path}/comments`, 0, "POST", {
      body: "x".repeat(10000),
      requestId: randomUUID(),
    });
    assert.equal(oversized.status, 400);
    passed(
      "CSRF, oversized input, malformed IDs, and author injection are rejected",
    );

    const reactions = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(`${path}/community`, 0, "PUT", { kind: "like", active: true }),
      ),
    );
    assert.ok(reactions.every((response) => response.status === 200));
    assert.equal(
      await prisma.articleLike.count({
        where: { userId: ids[0], articleId: article.id },
      }),
      1,
    );
    const liked = await (await request(`${path}/community`, 0)).json();
    assert.equal(liked.state.likes, baseline.state.likes + 1);
    assert.equal(liked.state.liked, true);
    assert.equal(
      (await (await request(`${path}/community`, 1)).json()).state.liked,
      false,
    );
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await request(`${path}/community`, 0, "PUT", {
            kind: "like",
            active: false,
          })
        ).status,
        200,
      );
    assert.equal(
      (await (await request(`${path}/community`)).json()).state.likes,
      baseline.state.likes,
    );
    passed(
      "concurrent likes and repeated cancellation are idempotent and user-specific",
    );

    await request(`${path}/community`, 0, "PUT", {
      kind: "bookmark",
      active: true,
    });
    await request(`${path}/community`, 0, "PUT", {
      kind: "bookmark",
      active: true,
    });
    await request(`${secondPath}/community`, 1, "PUT", {
      kind: "bookmark",
      active: true,
    });
    await prisma.bookmark.create({
      data: { userId: ids[0], articleId: "qa-unpublished" },
    });
    const saved = await (
      await request(`/api/account/activity?kind=bookmarks&userId=${ids[1]}`, 0)
    ).json();
    assert.equal(saved.items.length, 1);
    assert.equal(saved.items[0].articleId, article.id);
    assert.equal(saved.items[0].href, `/articles/${article.slug}`);
    assert.equal(
      (await (await request(`${path}/community`, 1)).json()).state.bookmarked,
      false,
    );
    await request(`${path}/community`, 0, "PUT", {
      kind: "bookmark",
      active: false,
    });
    assert.equal(
      (await (await request("/api/account/activity?kind=bookmarks", 0)).json())
        .items.length,
      0,
    );
    assert.equal(await prisma.bookmark.count({ where: { userId: ids[1] } }), 1);
    passed(
      "bookmarks stay private, withdrawn articles stay hidden, and cancellation is isolated",
    );

    const root = await post(
      0,
      "第一行\n<script>window.__communityXss=true</script>",
    );
    assert.equal(root.response.status, 201);
    const replay = await post(
      0,
      "第一行\n<script>window.__communityXss=true</script>",
      undefined,
      root.id,
    );
    assert.equal(replay.response.status, 200);
    assert.equal(await prisma.comment.count({ where: { id: root.id } }), 1);
    assert.equal(
      (await post(1, "collision", undefined, root.id)).response.status,
      409,
    );
    const reply = await post(1, "回复内容", root.id);
    assert.equal(reply.response.status, 201);
    assert.equal(
      (await post(1, "wrong article", root.id, randomUUID(), secondPath))
        .response.status,
      404,
    );
    assert.equal((await post(0, "nested", reply.id)).response.status, 404);
    const roots = await (await request(`${path}/comments`, 0)).json();
    const own = roots.items.find((row: { id: string }) => row.id === root.id);
    assert.equal(own.mine, true);
    assert.equal(own.replyCount, 1);
    assert.ok(own.body.includes("<script>"));
    assert.deepEqual(Object.keys(own.author).sort(), ["image", "name"]);
    assert.ok(!JSON.stringify(roots).includes("@example.invalid"));
    const replies = await (
      await request(`${path}/comments?parentId=${root.id}`)
    ).json();
    assert.equal(replies.items[0].id, reply.id);
    assert.equal(replies.items[0].mine, false);
    passed(
      "comments preserve plain text, redact private fields, deduplicate retries, and constrain replies",
    );

    assert.equal(
      (await request(`${path}/comments/${root.id}`, 1, "DELETE", {})).status,
      404,
    );
    assert.equal(
      (await request(`${secondPath}/comments/${root.id}`, 0, "DELETE", {}))
        .status,
      404,
    );
    assert.equal(
      (
        await request(
          `${path}/comments/${root.id}`,
          0,
          "DELETE",
          {},
          "https://evil.example",
        )
      ).status,
      403,
    );
    assert.equal(
      (await request(`${path}/comments/${root.id}`, 0, "DELETE", {})).status,
      200,
    );
    const erased = await prisma.comment.findUniqueOrThrow({
      where: { id: root.id },
    });
    assert.equal(erased.body, "");
    assert.ok(erased.deletedAt);
    const afterDelete = await (await request(`${path}/comments`)).json();
    const tombstone = afterDelete.items.find(
      (row: { id: string }) => row.id === root.id,
    );
    assert.equal(tombstone.deleted, true);
    assert.equal(tombstone.author, null);
    assert.equal(tombstone.replyCount, 1);
    assert.equal((await post(1, "deleted", root.id)).response.status, 404);
    assert.equal(
      (await (await request(`${path}/comments?parentId=${root.id}`)).json())
        .items[0].body,
      "回复内容",
    );
    passed(
      "only owners delete; deletion erases content while preserving existing replies",
    );

    const pageIds = Array.from({ length: COMMENT_PAGE_SIZE * 2 + 1 }, () =>
      randomUUID(),
    );
    const createdAt = new Date(Date.now() + 1000);
    await prisma.comment.createMany({
      data: pageIds.map((id, index) => ({
        id,
        articleId: article.id,
        userId: ids[0],
        body: `分页评论 ${index + 1}`,
        createdAt,
      })),
    });
    const found: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { items: { id: string }[]; nextCursor: string | null } =
        await (
          await request(`${path}/comments${cursor ? `?cursor=${cursor}` : ""}`)
        ).json();
      assert.ok(page.items.length <= COMMENT_PAGE_SIZE);
      found.push(...page.items.map((row) => row.id));
      cursor = page.nextCursor;
      assert.ok(found.length < 1000, "Pagination must terminate.");
    } while (cursor);
    assert.equal(new Set(found).size, found.length);
    assert.ok(pageIds.every((id) => found.includes(id)));
    assert.equal(
      (await request(`${secondPath}/comments?cursor=${pageIds[0]}`)).status,
      400,
    );
    assert.equal(
      (await request(`${path}/comments?cursor=invalid`)).status,
      400,
    );
    const activity = await (
      await request("/api/account/activity?kind=comments", 0)
    ).json();
    assert.equal(activity.items.length, 6);
    assert.equal(activity.nextPage, 2);
    const nextActivity = await (
      await request("/api/account/activity?kind=comments&page=2", 0)
    ).json();
    assert.ok(
      nextActivity.items.every(
        (row: { id: string }) =>
          !activity.items.some((first: { id: string }) => first.id === row.id),
      ),
    );
    assert.equal(
      (await request("/api/account/activity?kind=comments&page=-1", 0)).status,
      400,
    );
    passed(
      "comment cursors handle equal timestamps and account history is paginated",
    );

    await clearLimits();
    const throttled = await Promise.all(
      Array.from({ length: 6 }, (_, index) => post(0, `限流并发 ${index}`)),
    );
    assert.equal(
      throttled.filter((item) => item.response.status === 201).length,
      5,
    );
    const limited = throttled.filter((item) => item.response.status === 429);
    assert.equal(limited.length, 1);
    assert.equal(limited[0].response.headers.get("retry-after"), "60");
    assert.equal(
      await prisma.interactionLimit
        .findUniqueOrThrow({
          where: { userId_action: { userId: ids[0], action: "comment" } },
        })
        .then((row) => row.count),
      5,
    );
    passed("database-backed comment limits hold under concurrent writes");

    await prisma.user.update({ where: { id: ids[1] }, data: { banned: true } });
    assert.equal(
      (
        await request(`${path}/community`, 1, "PUT", {
          kind: "like",
          active: true,
        })
      ).status,
      401,
    );
    assert.equal((await post(1, "banned")).response.status, 401);
    assert.equal((await request("/api/account/activity", 1)).status, 401);
    assert.equal(await prisma.session.count({ where: { userId: ids[1] } }), 0);
    passed(
      "banned users lose interaction and private-history access immediately",
    );
    console.log(
      `Community integration check passed: ${checks} groups. Temporary data is removed.`,
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
