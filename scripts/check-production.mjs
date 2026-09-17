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
