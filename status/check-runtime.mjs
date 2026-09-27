import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createTestHarness } from "wrangler";

// Real workerd, D1 and asset bindings, with an isolated loopback origin.
// This test never contacts the public blog or Cloudflare's management API.
let failing = false;
const origin = createServer((request, response) => {
  response.statusCode = failing ? 503 : 200;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Set-Cookie", "fixture=value; HttpOnly; SameSite=Lax");
  const component = request.url.startsWith("/search")
    ? "search"
    : request.url === "/articles"
      ? "articles"
      : "website";
  response.end(
    failing
      ? "Unavailable"
      : `<main data-status-component="${component}">OK</main>`,
  );
});
origin.listen(0, "127.0.0.1");
await once(origin, "listening");
const main = `http://127.0.0.1:${origin.address().port}`;
const status = "https://status.world9566.online";
const harness = createTestHarness({
  root: import.meta.dirname,
  workers: [
    {
      configPath: "wrangler.jsonc",
      vars: { MAIN_ORIGIN: main, STATUS_ORIGIN: status },
    },
  ],
});
try {
  await harness.listen();
  const worker = harness.getWorker();
  await worker.applyD1Migrations("DB");
  const initial = await worker.fetch(status + "/api/status");
  assert.equal((await initial.json()).status, "unknown");
  const page = await worker.fetch(status);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /状态暂未更新/);
  for (const path of ["/style.css", "/page.js", "/icon.svg"]) {
    const asset = await worker.fetch(status + path);
    assert.equal(asset.status, 200, path);
    assert.ok((await asset.text()).length > 0);
  }
  await worker.scheduled({ cron: "* * * * *", scheduledTime: new Date() });
  const healthy = await worker.fetch(status + "/api/status");
  const report = await healthy.json();
  assert.equal(report.status, "operational");
  assert.equal(report.checks.length, 3);
  assert.ok(report.checks.every((check) => check.history.at(-1).total === 1));
  const navigationHeaders = {
    Accept: "text/html",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
  };
  const normal = await worker.fetch(main, { headers: navigationHeaders });
  assert.equal(normal.status, 200);
  assert.match(normal.headers.get("set-cookie"), /fixture=value/);
  await normal.text();
  failing = true;
  const failed = await worker.fetch(main, {
    headers: navigationHeaders,
    redirect: "manual",
  });
  assert.equal(failed.status, 302);
  assert.equal(failed.headers.get("location"), status + "/?from=main");
  const api = await worker.fetch(main + "/api/test", {
    headers: { Accept: "text/html" },
  });
  assert.equal(api.status, 503);
  assert.equal(await api.text(), "Unavailable");
  const independent = await worker.fetch(status);
  assert.equal(independent.status, 200);
  assert.match(await independent.text(), /网站状态/);
  console.log(
    "Worker runtime check passed: entrypoint, D1 migration, assets, cron, origin proxy and failure redirect.",
  );
} catch (error) {
  harness.debug();
  throw error;
} finally {
  await harness.close();
  await new Promise((resolve, reject) =>
    origin.close((error) => (error ? reject(error) : resolve())),
  );
}
