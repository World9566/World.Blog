import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test from "node:test";
import {
  components,
  createWorker,
  collect,
  publicStatus,
  recordProbe,
  probe,
  STALE_MS,
} from "../status/worker.mjs";
import { renderPage } from "../status/page.mjs";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("status/migrations/0001_status.sql", "utf8"));
  const db = {
    prepare(query: string) {
      let values: SQLInputValue[] = [];
      const statement = sqlite.prepare(query);
      return {
        bind(...args: SQLInputValue[]) {
          values = args;
          return this;
        },
        async first() {
          return statement.get(...values) || null;
        },
        execute() {
          return {
            results: statement.columns().length
              ? statement.all(...values)
              : (statement.run(...values), []),
          };
        },
      };
    },
    async batch(statements: { execute(): { results: unknown[] } }[]) {
      sqlite.exec("BEGIN");
      try {
        const result = statements.map((statement) => statement.execute());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, close: () => sqlite.close() };
}
const env = {
  MAIN_ORIGIN: "https://www.world9566.online",
  STATUS_ORIGIN: "https://status.world9566.online",
};
const time = Date.parse("2026-09-27T04:00:00Z");

test("public status starts unknown, confirms incidents, recovers and never fills missing history", async () => {
  const fixture = database();
  try {
    const fresh = await publicStatus(fixture.db, time);
    assert.equal(fresh.status, "unknown");
    assert.ok(
      fresh.checks.every((check) =>
        check.history.every((day) => day.total === 0),
      ),
    );
    for (let minute = 0; minute < 3; minute++)
      await recordProbe(
        fixture.db,
        "website",
        { ok: false, latency: null },
        time + minute * 60000,
      );
    let report = await publicStatus(fixture.db, time + 120000);
    assert.equal(report.status, "outage");
    assert.equal(report.incidents.length, 1);
    assert.equal(report.incidents[0].resolvedAt, null);
    await recordProbe(
      fixture.db,
      "website",
      { ok: false, latency: null },
      time + 120000,
    );
    await recordProbe(
      fixture.db,
      "website",
      { ok: true, latency: 50 },
      time + 60000,
    );
    report = await publicStatus(fixture.db, time + 120000);
    assert.equal(
      report.checks[0].history.at(-1)?.total,
      3,
      "duplicate or older cron cannot add samples",
    );
    await recordProbe(
      fixture.db,
      "website",
      { ok: true, latency: 50 },
      time + 180000,
    );
    assert.equal(
      (await publicStatus(fixture.db, time + 180000)).checks[0].status,
      "outage",
    );
    await recordProbe(
      fixture.db,
      "website",
      { ok: true, latency: 50 },
      time + 240000,
    );
    report = await publicStatus(fixture.db, time + 240000);
    assert.equal(report.checks[0].status, "operational");
    assert.ok(report.incidents[0].resolvedAt);
    assert.deepEqual(report.checks[0].history.at(-1), {
      day: "2026-09-27",
      passed: 2,
      total: 5,
    });
    assert.equal(
      (await publicStatus(fixture.db, time + 240000 + STALE_MS + 1)).status,
      "unknown",
    );
    assert.doesNotMatch(
      JSON.stringify(report),
      /failures|password|postgres|backup|disk|latency_ms/,
    );
  } finally {
    fixture.close();
  }
});

test("monitor gaps break failure streaks and daily history uses Shanghai dates", async () => {
  const fixture = database();
  try {
    await recordProbe(
      fixture.db,
      "website",
      { ok: false, latency: null },
      time,
    );
    await recordProbe(
      fixture.db,
      "website",
      { ok: false, latency: null },
      time + 60000,
    );
    await recordProbe(
      fixture.db,
      "website",
      { ok: false, latency: null },
      time + 10 * 60000,
    );
    assert.equal(
      (await publicStatus(fixture.db, time + 10 * 60000)).checks[0].status,
      "degraded",
    );
    await recordProbe(
      fixture.db,
      "articles",
      { ok: true, latency: 20 },
      Date.parse("2026-09-27T16:00:00Z"),
    );
    const report = await publicStatus(
      fixture.db,
      Date.parse("2026-09-27T16:00:00Z"),
    );
    assert.equal(report.checks[1].history.at(-1)?.day, "2026-09-28");
    assert.equal(report.checks[1].history.at(-1)?.total, 1);
  } finally {
    fixture.close();
  }
});

test("probes reject 200 challenge/error pages, redirects, missing markup and failed requests", async () => {
  for (const response of [
    new Response("challenge", { headers: { "content-type": "text/html" } }),
    new Response("", { status: 302, headers: { location: env.STATUS_ORIGIN } }),
    new Response("{}", { headers: { "content-type": "application/json" } }),
  ]) {
    assert.equal(
      (
        await probe(
          components[0],
          env.MAIN_ORIGIN,
          async () => response,
          () => time,
        )
      ).ok,
      false,
    );
  }
  assert.equal(
    (
      await probe(
        components[0],
        env.MAIN_ORIGIN,
        async () => {
          throw new Error("network");
        },
        () => time,
      )
    ).ok,
    false,
  );
  assert.equal(
    (
      await probe(
        components[0],
        env.MAIN_ORIGIN,
        async () =>
          new Response(`<main ${components[0].marker}>`, {
            headers: { "content-type": "text/html" },
          }),
        () => time,
      )
    ).ok,
    true,
  );
});

test("edge redirects only failed document navigation and preserves APIs, RSC and cookies", async () => {
  const ctx = { passThroughOnException() {} };
  for (const status of [500, 502, 503, 504, 522, 530]) {
    const worker = createWorker(
      async () => new Response("unavailable", { status }),
      () => time,
    );
    const response = await worker.fetch(
      new Request(`${env.MAIN_ORIGIN}/articles/test?private=never-forward`, {
        headers: { Accept: "text/html", Cookie: "private-session" },
      }),
      env,
      ctx,
    );
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("location"),
      `${env.STATUS_ORIGIN}/?from=main`,
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("set-cookie"), null);
  }
  const paths = [
    "/api/auth/callback/github?code=secret",
    "/api/admin/users",
    "/_next/static/test.js",
    "/media/image.webp",
    "/feed.xml",
  ];
  const worker = createWorker(
    async (request) => {
      assert.equal(new Request(request).headers.get("cookie"), "preserved");
      return new Response("original", {
        status: 503,
        headers: { "set-cookie": "keep=value; Secure; HttpOnly", Vary: "RSC" },
      });
    },
    () => time,
  );
  for (const url of paths) {
    const response = await worker.fetch(
      new Request(env.MAIN_ORIGIN + url, {
        headers: { Accept: "text/html", Cookie: "preserved" },
      }),
      env,
      ctx,
    );
    assert.equal(response.status, 503);
    assert.equal(
      response.headers.get("set-cookie"),
      "keep=value; Secure; HttpOnly",
    );
    assert.equal(await response.text(), "original");
  }
  const internalHeaders: Record<string, string>[] = [
    { RSC: "1" },
    { "Next-Router-Prefetch": "1" },
    { Purpose: "prefetch" },
    { "Sec-Purpose": "prefetch;prerender" },
    { "Sec-Fetch-Dest": "empty" },
    { "Sec-Fetch-Dest": "iframe" },
  ];
  for (const headers of internalHeaders) {
    assert.equal(
      (
        await worker.fetch(
          new Request(env.MAIN_ORIGIN, {
            headers: { Accept: "text/html", Cookie: "preserved", ...headers },
          }),
          env,
          ctx,
        )
      ).status,
      503,
    );
  }
  assert.equal(
    (
      await worker.fetch(
        new Request(env.MAIN_ORIGIN, {
          method: "POST",
          body: "unchanged",
          headers: { Accept: "text/html", Cookie: "preserved" },
        }),
        env,
        ctx,
      )
    ).status,
    503,
  );
  for (const status of [200, 302, 401, 403, 404, 429]) {
    const passthrough = createWorker(
      async () => new Response("original", { status }),
      () => time,
    );
    assert.equal(
      (
        await passthrough.fetch(
          new Request(env.MAIN_ORIGIN, { headers: { Accept: "text/html" } }),
          env,
          ctx,
        )
      ).status,
      status,
    );
  }
  const down = createWorker(
    async () => {
      throw new Error("offline");
    },
    () => time,
  );
  assert.equal(
    (
      await down.fetch(
        new Request(env.MAIN_ORIGIN, { headers: { Accept: "text/html" } }),
        env,
        ctx,
      )
    ).status,
    302,
  );
});

test("status survives origin/storage failure, rejects writes, and publishes only sanitized history", async () => {
  const fixture = database();
  const ctx = { passThroughOnException() {} };
  try {
    const worker = createWorker(
      async () => {
        throw new Error("private backend detail");
      },
      () => time,
    );
    await worker.scheduled({}, { ...env, DB: fixture.db }, ctx);
    const response = await worker.fetch(
      new Request(env.STATUS_ORIGIN),
      { ...env, DB: fixture.db },
      ctx,
    );
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-security-policy")!,
      /frame-ancestors 'none'/,
    );
    assert.doesNotMatch(await response.text(), /private backend detail/);
    const noStorage = await worker.fetch(
      new Request(env.STATUS_ORIGIN),
      env,
      ctx,
    );
    assert.equal(noStorage.status, 200);
    assert.match(await noStorage.text(), /状态暂未更新/);
    assert.equal(
      (
        await worker.fetch(
          new Request(`${env.STATUS_ORIGIN}/api/status`, { method: "POST" }),
          { ...env, DB: fixture.db },
          ctx,
        )
      ).status,
      405,
    );
    assert.equal(
      (await worker.fetch(new Request("https://attacker.invalid/"), env, ctx))
        .status,
      404,
    );
    const api = await worker.fetch(
      new Request(`${env.STATUS_ORIGIN}/api/status`),
      { ...env, DB: fixture.db },
      ctx,
    );
    assert.equal(
      api.headers.get("access-control-allow-origin"),
      env.MAIN_ORIGIN,
    );
    assert.equal(api.headers.get("access-control-allow-credentials"), null);
    const head = await worker.fetch(
      new Request(`${env.STATUS_ORIGIN}/api/status`, { method: "HEAD" }),
      { ...env, DB: fixture.db },
      ctx,
    );
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    assert.doesNotMatch(
      JSON.stringify(await api.json()),
      /failures|successes|private backend|secret/,
    );
    const html = renderPage(
      await publicStatus(fixture.db, time),
      'https://example.invalid/"<script>bad</script>',
    );
    assert.doesNotMatch(html, /<script>bad/);
  } finally {
    fixture.close();
  }
});

test("scheduled collection bounds retained history without deleting open incidents", async () => {
  const fixture = database();
  try {
    for (let i = 0; i < 3; i++)
      await recordProbe(
        fixture.db,
        "website",
        { ok: false, latency: null },
        time + i * 60000,
      );
    const future = time + 100 * 86400000;
    await collect(
      { ...env, DB: fixture.db },
      async () => new Response("unavailable", { status: 503 }),
      () => future,
    );
    const report = await publicStatus(fixture.db, future);
    assert.equal(report.incidents.length, 1);
    assert.equal(report.incidents[0].resolvedAt, null);
    assert.equal(
      report.checks[0].history.reduce((sum, day) => sum + day.total, 0),
      1,
    );
  } finally {
    fixture.close();
  }
});
