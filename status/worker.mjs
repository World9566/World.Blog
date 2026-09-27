import { renderPage } from "./page.mjs";

export const components = [
  {
    id: "website",
    name: "网站访问",
    path: "/",
    marker: 'data-status-component="website"',
  },
  {
    id: "articles",
    name: "文章浏览",
    path: "/articles",
    marker: 'data-status-component="articles"',
  },
  {
    id: "search",
    name: "站内搜索",
    path: "/search?q=World",
    marker: 'data-status-component="search"',
  },
];
export const STALE_MS = 5 * 60000;
const dayAt = (time) => new Date(time + 8 * 3600000).toISOString().slice(0, 10);
const iso = (value) => (value == null ? null : new Date(value).toISOString());
const origins = (env) => ({
  main: new URL(env.MAIN_ORIGIN || "https://www.world9566.online").origin,
  status: new URL(env.STATUS_ORIGIN || "https://status.world9566.online")
    .origin,
});
const json = (body, status = 200, headers = {}) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });

// Only document navigation may become a redirect. Cookies, mutations, RSC,
// assets and API errors continue through with their original response.
export function isDocumentRequest(request) {
  const url = new URL(request.url);
  return (
    ["GET", "HEAD"].includes(request.method) &&
    request.headers.get("accept")?.includes("text/html") &&
    !request.headers.has("rsc") &&
    !request.headers.has("next-router-prefetch") &&
    !request.headers.get("purpose")?.includes("prefetch") &&
    !request.headers.get("sec-purpose")?.includes("prefetch") &&
    (!request.headers.has("sec-fetch-dest") ||
      request.headers.get("sec-fetch-dest") === "document") &&
    !/^\/(api|_next|media|assets)(\/|$)/.test(url.pathname) &&
    !/\.[a-z0-9]{1,8}$/i.test(url.pathname)
  );
}

export async function probe(
  component,
  origin,
  fetcher = fetch,
  now = Date.now,
) {
  const start = now();
  let response;
  let reader;
  try {
    response = await fetcher(new URL(component.path, origin), {
      headers: { Accept: "text/html", "Cache-Control": "no-cache" },
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    if (
      response.status !== 200 ||
      !response.headers.get("content-type")?.includes("text/html")
    )
      return { ok: false, latency: null };
    reader = response.body?.getReader();
    if (!reader) return { ok: false, latency: null };
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    // Read only enough HTML to verify the rendered feature, not a login,
    // challenge or streaming error page that happens to use HTTP 200.
    while (bytes < 512 * 1024) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      text += decoder.decode(chunk.value, { stream: true });
      if (text.includes(component.marker))
        return { ok: true, latency: Math.max(0, Math.round(now() - start)) };
      text = text.slice(-1024);
    }
  } catch {
    /* A failed probe is recorded without its raw response or URL. */
  } finally {
    if (reader) await reader.cancel().catch(() => {});
    else await response?.body?.cancel().catch(() => {});
  }
  return { ok: false, latency: null };
}

export async function recordProbe(db, component, result, time) {
  const bucket = Math.floor(time / 60000);
  const previous = await db
    .prepare("SELECT * FROM components WHERE id = ?")
    .bind(component)
    .first();
  if (previous && previous.bucket >= bucket) return;
  // A gap breaks the consecutive-failure sequence; it is not evidence of health.
  const contiguous = previous && time - previous.checked_at < STALE_MS;
  const failures = result.ok
    ? 0
    : Math.min(9999, (contiguous ? previous.failures : 0) + 1);
  const successes = result.ok
    ? Math.min(9999, (contiguous ? previous.successes : 0) + 1)
    : 0;
  const status = result.ok
    ? previous?.status === "outage" && successes < 2
      ? "outage"
      : "operational"
    : previous?.status === "outage" || failures >= 3
      ? "outage"
      : "degraded";
  const changed = previous?.status === status ? previous.changed_at : time;
  await db.batch([
    db
      .prepare(
        `INSERT INTO components (id,status,failures,successes,checked_at,changed_at,bucket,latency_ms)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,failures=excluded.failures,
      successes=excluded.successes,checked_at=excluded.checked_at,changed_at=excluded.changed_at,
      bucket=excluded.bucket,latency_ms=excluded.latency_ms WHERE components.bucket < excluded.bucket`,
      )
      .bind(
        component,
        status,
        failures,
        successes,
        time,
        changed,
        bucket,
        result.latency,
      ),
    db
      .prepare(
        `INSERT INTO daily (component,day,passed,total,last_bucket)
      SELECT ?,?,?,1,? WHERE EXISTS (SELECT 1 FROM components WHERE id=? AND bucket=?)
      ON CONFLICT(component,day) DO UPDATE SET passed=daily.passed+excluded.passed,total=daily.total+1,
      last_bucket=excluded.last_bucket WHERE daily.last_bucket < excluded.last_bucket`,
      )
      .bind(
        component,
        dayAt(time),
        result.ok ? 1 : 0,
        bucket,
        component,
        bucket,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO incidents (component,started_at)
      SELECT id,checked_at FROM components WHERE id=? AND bucket=? AND status='outage'`,
      )
      .bind(component, bucket),
    db
      .prepare(
        `UPDATE incidents SET resolved_at=? WHERE component=? AND resolved_at IS NULL
      AND EXISTS (SELECT 1 FROM components WHERE id=? AND bucket=? AND status='operational')`,
      )
      .bind(time, component, component, bucket),
  ]);
}

export async function collect(env, fetcher = fetch, now = Date.now) {
  const time = now();
  await Promise.all(
    components.map(async (component) => {
      const result = await probe(component, origins(env).main, fetcher, now);
      await recordProbe(env.DB, component.id, result, time);
    }),
  );
  await env.DB.batch([
    env.DB.prepare("DELETE FROM daily WHERE day < ?").bind(
      dayAt(time - 29 * 86400000),
    ),
    env.DB.prepare(
      "DELETE FROM incidents WHERE resolved_at IS NOT NULL AND resolved_at < ?",
    ).bind(time - 90 * 86400000),
  ]);
}

export async function publicStatus(db, time = Date.now()) {
  let rows = [],
    days = [],
    incidents = [];
  try {
    const results = await db.batch([
      db.prepare(
        "SELECT id,status,checked_at,changed_at,latency_ms FROM components",
      ),
      db
        .prepare(
          "SELECT component,day,passed,total FROM daily WHERE day >= ? ORDER BY day",
        )
        .bind(dayAt(time - 29 * 86400000)),
      db
        .prepare(
          "SELECT component,started_at,resolved_at FROM incidents WHERE resolved_at IS NULL OR resolved_at >= ? ORDER BY started_at DESC LIMIT 30",
        )
        .bind(time - 90 * 86400000),
    ]);
    [rows, days, incidents] = results.map((result) => result.results);
  } catch {
    /* Missing storage must render unknown, never a false all-clear. */
  }
  const checks = components.map((component) => {
    const row = rows.find((row) => row.id === component.id);
    const fresh =
      row &&
      time - row.checked_at <= STALE_MS &&
      time >= row.checked_at - 60000;
    const history = Array.from({ length: 30 }, (_, i) => {
      const day = dayAt(time - (29 - i) * 86400000);
      const sample = days.find(
        (item) => item.component === component.id && item.day === day,
      );
      return { day, passed: sample?.passed || 0, total: sample?.total || 0 };
    });
    return {
      id: component.id,
      name: component.name,
      status: fresh ? row.status : "unknown",
      checkedAt: iso(row?.checked_at),
      changedAt: iso(row?.changed_at),
      latency: fresh ? row.latency_ms : null,
      history,
    };
  });
  const status = checks.some((check) => check.status === "outage")
    ? "outage"
    : checks.some((check) => check.status === "unknown")
      ? "unknown"
      : checks.some((check) => check.status === "degraded")
        ? "degraded"
        : "operational";
  return {
    status,
    generatedAt: iso(time),
    checks,
    incidents: incidents
      .filter((item) =>
        components.some((component) => component.id === item.component),
      )
      .map((item) => ({
        component: item.component,
        startedAt: iso(item.started_at),
        resolvedAt: iso(item.resolved_at),
      })),
  };
}

export function createWorker(fetcher = fetch, now = Date.now) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const origin = origins(env);
      if (url.origin === origin.main) {
        ctx.passThroughOnException?.();
        if (!isDocumentRequest(request)) return fetcher(request);
        try {
          const response = await fetcher(request, {
            signal: AbortSignal.timeout(20000),
          });
          if (response.status < 500) return response;
          await response.body?.cancel().catch(() => {});
        } catch {
          /* The fixed destination cannot leak a query, cookie or token. */
        }
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${origin.status}/?from=main`,
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      }
      // Loopback is accepted only by the local emulator, never as an origin to proxy.
      if (
        url.origin !== origin.status &&
        !["127.0.0.1", "localhost"].includes(url.hostname)
      )
        return new Response("Not found", { status: 404 });
      if (!["GET", "HEAD"].includes(request.method))
        return json({ message: "Method not allowed" }, 405, {
          Allow: "GET, HEAD",
        });
      if (url.pathname === "/api/status") {
        const response = json(await publicStatus(env.DB, now()), 200, {
          "Access-Control-Allow-Origin": origin.main,
          Vary: "Origin",
        });
        return request.method === "HEAD"
          ? new Response(null, response)
          : response;
      }
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const report = await publicStatus(env.DB, now());
        return new Response(
          request.method === "HEAD" ? null : renderPage(report, origin.main),
          {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
              "Referrer-Policy": "no-referrer",
              "X-Content-Type-Options": "nosniff",
              "X-Frame-Options": "DENY",
              "Content-Security-Policy":
                "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
            },
          },
        );
      }
      if (["/style.css", "/page.js", "/icon.svg"].includes(url.pathname))
        return env.ASSETS.fetch(request);
      if (url.pathname === "/robots.txt")
        return new Response(
          request.method === "HEAD"
            ? null
            : "User-agent: *\nAllow: /\nDisallow: /api/\n",
          { headers: { "Content-Type": "text/plain; charset=utf-8" } },
        );
      return new Response("Not found", { status: 404 });
    },
    async scheduled(_event, env, _ctx) {
      await collect(env, fetcher, now);
    },
  };
}
export default createWorker();
