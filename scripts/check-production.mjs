import assert from "node:assert/strict";

// Run inside the maintenance container after deployment to an isolated test stack.
const base = process.env.CHECK_BASE_URL || "http://gateway:8080";
const origin = process.env.SITE_URL;
assert.ok(
  origin?.endsWith(".invalid"),
  "Use only an isolated rehearsal domain.",
);
async function request(path, options = {}) {
  return fetch(new URL(path, base), {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    ...options,
  });
}
const health = await request("/api/health");
assert.equal(health.status, 200);
assert.match(health.headers.get("cache-control"), /no-store/);
for (const path of ["/api/health", "/api/content/refresh"]) {
  assert.equal(
    (await request(path, { headers: { "CF-Connecting-IP": "192.0.2.30" } }))
      .status,
    404,
  );
}
assert.equal((await request("/api/content/refresh")).status, 401);
assert.equal(
  (
    await request("/api/content/refresh", {
      headers: { Authorization: `Bearer ${process.env.CONTENT_REFRESH_TOKEN}` },
    })
  ).status,
  200,
);
const home = await request("/");
assert.equal(home.status, 200);
assert.equal(home.headers.get("x-content-type-options"), "nosniff");
assert.equal(home.headers.get("x-frame-options"), "SAMEORIGIN");
const html = await home.text();
assert.ok(html.includes(origin), "Built canonical origin");
const asset = html.match(
  /(?:src|href)="([^"\s]+\/_next\/static\/[^"\s]+|\/_next\/static\/[^"\s]+)"/,
);
assert.ok(asset, "Static asset is present");
assert.equal((await request(asset[1].replaceAll("&amp;", "&"))).status, 200);
for (const path of ["/feed.xml", "/sitemap.xml"]) {
  const response = await request(path);
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes(origin));
}
for (const path of ["/account", "/admin"]) {
  const response = await request(path, {
    headers: {
      "X-Forwarded-Host": "attacker.invalid",
      "X-Forwarded-Proto": "http",
    },
  });
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location"), origin);
  assert.equal(location.origin, origin);
  assert.equal(location.pathname, "/login");
}
assert.equal((await request("/api/admin/users")).status, 401);
const login = await request("/api/auth/sign-in/social", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({
    provider: "github",
    callbackURL: `${origin}/account`,
  }),
});
assert.equal(login.status, 200);
const authorize = new URL((await login.json()).url);
assert.equal(authorize.origin, "https://github.com");
assert.equal(
  authorize.searchParams.get("redirect_uri"),
  `${origin}/api/auth/callback/github`,
);
const cookies = login.headers.getSetCookie();
assert.ok(cookies.length > 0);
assert.ok(
  cookies.some(
    (value) =>
      /HttpOnly/i.test(value) &&
      /Secure/i.test(value) &&
      /SameSite=Lax/i.test(value),
  ),
);
console.log(
  "Production HTTP checks passed: assets, origin, proxy headers, private routes, OAuth callback and secure cookies.",
);

// A distinct documentation IP isolates these counters from the rest of CI.
const burst = async (path, ip, count) =>
  Promise.all(
    Array.from({ length: count }, (_, i) =>
      request(`${path}?probe=${i}`, {
        // Untrusted forwarding headers rotate, but the verified CF source
        // remains fixed. They must not split one visitor into many budgets.
        headers: {
          "CF-Connecting-IP": ip,
          "X-Real-IP": `192.0.3.${i + 1}`,
          "X-Forwarded-For": `192.0.4.${i + 1}`,
        },
      }),
    ),
  );
const searchBurst = await burst("/search", "192.0.2.40", 90);
const searchLimited = searchBurst.find((response) => response.status === 429);
assert.ok(searchLimited, "Search flood is limited before reaching Next.js");
assert.equal(searchLimited.headers.get("retry-after"), "30");
assert.match(searchLimited.headers.get("content-type"), /text\/html/);
assert.match(await searchLimited.text(), /稍后再试/);
assert.equal(
  (await request("/search", { headers: { "CF-Connecting-IP": "192.0.2.41" } }))
    .status,
  200,
);
const commentBurst = await burst(
  "/api/articles/missing/community",
  "192.0.2.42",
  160,
);
const commentLimited = commentBurst.find((response) => response.status === 429);
assert.ok(commentLimited, "Public comment reads have a separate budget");
assert.match(commentLimited.headers.get("cache-control"), /no-store/);
assert.match((await commentLimited.json()).message, /30/);
// Do not require the next individual read to be rejected: the leaky bucket
// replenishes while accepted upstream requests finish. The burst above proves
// that rotating the untrusted headers cannot bypass the shared counter.
assert.equal(
  (
    await request("/api/articles/missing/community", {
      method: "PUT",
      headers: { "CF-Connecting-IP": "192.0.2.42" },
    })
  ).status,
  404,
);
assert.equal(
  (await request("/", { headers: { "CF-Connecting-IP": "192.0.2.42" } }))
    .status,
  200,
);
console.log(
  "Gateway checks passed: read limits, independent IP budgets, write exclusion and internal endpoint protection.",
);
