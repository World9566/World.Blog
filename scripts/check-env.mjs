import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";

const searchHost = process.env.MEILI_HOST;
const searchKey = process.env.MEILI_MASTER_KEY;
assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
assert.ok(searchHost && searchKey, "Search configuration is required");

async function request(path, options = {}) {
  const response = await fetch(new URL(path, searchHost), {
    ...options,
    headers: {
      Authorization: `Bearer ${searchKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(10000),
  });
  assert.ok(response.ok, `Search request failed: HTTP ${response.status}`);
  return response.json();
}

async function waitTask(task) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const result = await request(`/tasks/${task.taskUid}`);
    if (result.status === "succeeded") return;
    assert.notEqual(result.status, "failed", "Search task failed");
    assert.notEqual(result.status, "canceled", "Search task was canceled");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Search task timed out");
}

async function checkDatabase() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE environment_check (message text NOT NULL) ON COMMIT DROP");
    await client.query("INSERT INTO environment_check (message) VALUES ($1)", ["博客环境测试"]);
    const result = await client.query("SELECT message FROM environment_check");
    assert.equal(result.rows[0].message, "博客环境测试");
    await client.query("COMMIT");
    console.log("PASS PostgreSQL authentication, UTF-8 read and write");
  } finally {
    await client.end();
  }
}

async function checkSearch() {
  const anonymous = await fetch(new URL("/indexes", searchHost), {
    signal: AbortSignal.timeout(5000),
  });
  assert.ok([401, 403].includes(anonymous.status), "Search must reject unauthenticated index access");

  const uid = `environment_check_${randomBytes(8).toString("hex")}`;
  let created = false;
  try {
    const creation = await request("/indexes", {
      method: "POST",
      body: JSON.stringify({ uid, primaryKey: "id" }),
    });
    created = true;
    await waitTask(creation);
    await waitTask(await request(`/indexes/${uid}/documents`, {
      method: "POST",
      body: JSON.stringify([{ id: 1, title: "使用 Docker 部署博客", body: "数据库与容器环境测试" }]),
    }));
    const results = await request(`/indexes/${uid}/search`, {
      method: "POST",
      body: JSON.stringify({ q: "数据库" }),
    });
    assert.equal(results.hits[0]?.id, 1, "Chinese body text should be searchable");
    console.log("PASS Meilisearch authentication, indexing and Chinese search");
  } finally {
    if (created) {
      await waitTask(await request(`/indexes/${uid}`, { method: "DELETE" }));
    }
  }
}

async function checkWeb() {
  const response = await fetch("http://127.0.0.1:3000/api/health", {
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, "ok");
  assert.equal(result.services.postgres, "ok");
  assert.equal(result.services.meilisearch, "ok");
  console.log("PASS Next.js health endpoint and service connections");
}

await checkDatabase();
await checkSearch();
await checkWeb();
console.log("Environment checks passed. Temporary test data was removed.");
