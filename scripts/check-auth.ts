import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac, randomUUID, randomBytes } from "node:crypto";
import { parseAdditionalUserInputFromProviderProfile } from "better-auth/db";
import { prisma } from "../src/lib/prisma";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { authOrigin, githubConfigured } from "../src/lib/auth-config";

async function main() {
  const base = process.env.CHECK_BASE_URL || "http://127.0.0.1:3000";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Auth checks only run against a local development server.");
  const prefix = `qa_${randomUUID()}`;
  const userIds = [`${prefix}_one`, `${prefix}_two`];
  const context = await auth.$context;
  const cookieName = context.authCookies.sessionToken.name;
  const secret = process.env.BETTER_AUTH_SECRET!;
  const token = () => randomBytes(32).toString("hex");
  const signed = (value: string) =>
    `${cookieName}=${encodeURIComponent(`${value}.${createHmac("sha256", secret).update(value).digest("base64")}`)}`;
  let checks = 0;
  function passed(message: string) {
    checks++;
    console.log(`PASS ${message}`);
  }
  async function request(
    path: string,
    cookie = "",
    method = "GET",
    body?: unknown,
    origin: string | null = authOrigin,
  ) {
    return fetch(new URL(path, base), {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
      headers: {
        ...(cookie ? { cookie } : {}),
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
  async function session(
    userId: string,
    expiresAt = new Date(Date.now() + 3600000),
  ) {
    const sessionToken = token();
    const row = await prisma.session.create({
      data: {
        id: randomUUID(),
        token: sessionToken,
        userId,
        expiresAt,
        userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0",
      },
    });
    return { id: row.id, cookie: signed(sessionToken) };
  }

  try {
    const mappedProfile = parseAdditionalUserInputFromProviderProfile(
      context.options,
      {
        githubUsername: "qa-reader",
        role: "admin",
        banned: true,
        bio: "ignored",
      },
      "create",
    );
    assert.equal(mappedProfile.githubUsername, "qa-reader");
    assert.equal(mappedProfile.role, undefined);
    assert.equal(mappedProfile.banned, false);
    assert.equal(mappedProfile.bio, "");
    passed(
      "OAuth profile mapping preserves GitHub usernames without importing privileges",
    );

    for (let i = 0; i < userIds.length; i++)
      await prisma.user.create({
        data: {
          id: userIds[i],
          email: `${prefix}_${i}@example.invalid`,
          name: `测试读者${i + 1}`,
          emailVerified: true,
          accounts: {
            create: {
              id: randomUUID(),
              providerId: "github",
              accountId: `${prefix}_${i}`,
            },
          },
        },
      });
    const owner = await session(userIds[0]);
    const other = await session(userIds[1]);
    const extra = await session(userIds[0]);
    const expired = await session(userIds[0], new Date(Date.now() - 1000));

    const anonymous = await request("/account");
    assert.equal(anonymous.status, 307);
    assert.ok(anonymous.headers.get("location")?.includes("/login"));
    assert.equal(
      await (
        await request("/api/auth/get-session", `${cookieName}=invalid`)
      ).json(),
      null,
    );
    assert.equal(
      await (await request("/api/auth/get-session", expired.cookie)).json(),
      null,
    );
    assert.equal(
      (
        await request("/api/account/profile", "", "PATCH", {
          name: "测试用户",
          bio: "",
        })
      ).status,
      401,
    );
    passed("anonymous, forged, and expired sessions are rejected");

    const valid = await request("/api/auth/get-session", owner.cookie);
    assert.equal(valid.status, 200);
    assert.ok((await valid.json()).user.id === userIds[0]);
    assert.match(valid.headers.get("cache-control") || "", /no-store/);
    const center = await request("/account", owner.cookie);
    assert.equal(center.status, 200);
    assert.ok((await center.text()).includes("测试读者1"));
    passed("valid sessions open the private account page");

    for (const origin of ["https://evil.example", null])
      assert.equal(
        (
          await request(
            "/api/account/profile",
            owner.cookie,
            "PATCH",
            { name: "测试用户", bio: "" },
            origin,
          )
        ).status,
        403,
      );
    assert.equal(
      (
        await request(
          "/api/auth/sign-out",
          owner.cookie,
          "POST",
          {},
          "https://evil.example",
        )
      ).status,
      403,
    );
    passed("cross-origin and originless mutations are rejected");

    for (const body of [
      { name: "测试用户", bio: "", role: "admin" },
      { name: "测试用户", bio: "", userId: userIds[1] },
      { name: "测试用户", bio: "", banned: false },
      { name: "测试用户", bio: "", githubUsername: "someone-else" },
      { name: "x", bio: "" },
      { name: "测试用户", bio: "x".repeat(501) },
    ])
      assert.equal(
        (await request("/api/account/profile", owner.cookie, "PATCH", body))
          .status,
        400,
      );
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: userIds[0] } })).role,
      "user",
    );
    assert.equal(
      (
        await request("/api/auth/update-user", owner.cookie, "POST", {
          role: "admin",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request("/api/auth/admin/set-role", owner.cookie, "POST", {
          userId: userIds[0],
          role: "admin",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request("/api/auth/sign-up/email", "", "POST", {
          email: "unused@example.invalid",
          password: "unused",
          name: "unused",
        })
      ).status,
      404,
    );
    passed(
      "profile validation prevents privilege and identity changes; unused auth endpoints stay closed",
    );

    const profile = {
      name: "新的读者昵称",
      bio: "第一行\n第二行 <img src=x onerror=alert(1)>",
    };
    assert.equal(
      (await request("/api/account/profile", owner.cookie, "PATCH", profile))
        .status,
      200,
    );
    const changed = await prisma.user.findUniqueOrThrow({
      where: { id: userIds[0] },
    });
    assert.equal(changed.name, profile.name);
    assert.equal(changed.bio, profile.bio);
    const updatedPage = await (await request("/account", owner.cookie)).text();
    assert.ok(updatedPage.includes(profile.name));
    assert.ok(!updatedPage.includes("<img src=x onerror=alert(1)>"));
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: userIds[1] } })).name,
      "测试读者2",
    );
    passed(
      "profile changes persist only for the current user and render as text",
    );

    assert.equal(
      (
        await request("/api/account/sessions/revoke", owner.cookie, "POST", {
          sessionId: other.id,
        })
      ).status,
      404,
    );
    assert.ok(await prisma.session.findUnique({ where: { id: other.id } }));
    assert.equal(
      (
        await request("/api/account/sessions/revoke", owner.cookie, "POST", {
          sessionId: owner.id,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/api/account/sessions/revoke", owner.cookie, "POST", {
          allOthers: true,
        })
      ).status,
      200,
    );
    assert.equal(
      await prisma.session.findUnique({ where: { id: extra.id } }),
      null,
    );
    assert.ok(await prisma.session.findUnique({ where: { id: owner.id } }));
    passed(
      "session revocation enforces ownership and keeps the current device",
    );

    await prisma.user.update({
      where: { id: userIds[1] },
      data: { banned: true },
    });
    assert.equal(
      (
        await request("/api/account/profile", other.cookie, "PATCH", {
          name: "测试用户",
          bio: "",
        })
      ).status,
      401,
    );
    assert.equal(
      await prisma.session.findUnique({ where: { id: other.id } }),
      null,
    );
    assert.equal(
      await (await request("/api/auth/get-session", other.cookie)).json(),
      null,
    );
    passed("disabled accounts lose access and their existing sessions");

    const signOut = await request(
      "/api/auth/sign-out",
      owner.cookie,
      "POST",
      {},
    );
    assert.equal(signOut.status, 200);
    assert.match(signOut.headers.get("set-cookie") || "", /Max-Age=0/);
    assert.equal(
      await (await request("/api/auth/get-session", owner.cookie)).json(),
      null,
    );
    passed("sign-out deletes the session and expires its cookie");

    if (githubConfigured) {
      const start = await request("/api/auth/sign-in/social", "", "POST", {
        provider: "github",
        callbackURL: "/account",
        disableRedirect: true,
      });
      assert.equal(start.status, 200);
      const destination = new URL((await start.json()).url);
      assert.equal(destination.origin, "https://github.com");
      assert.equal(
        destination.searchParams.get("redirect_uri"),
        `${authOrigin}/api/auth/callback/github`,
      );
      assert.ok(destination.searchParams.get("scope")?.includes("user:email"));
      assert.ok(!destination.searchParams.get("scope")?.includes("repo"));
      assert.ok(destination.searchParams.get("state"));
      passed(
        "GitHub authorization uses the configured callback and profile-only scopes",
      );
    }
    const before = await prisma.user.count();
    const invalidCallback = await request(
      "/api/auth/callback/github?code=invalid&state=invalid",
    );
    assert.ok(invalidCallback.status >= 300 && invalidCallback.status < 400);
    assert.equal(await prisma.user.count(), before);
    passed("an invalid OAuth state cannot create a user");
    console.log(
      `Auth integration check passed: ${checks} groups. Temporary users and sessions are removed.`,
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
