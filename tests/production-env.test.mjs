import assert from "node:assert/strict";
import test from "node:test";
import { checkProductionEnv } from "../scripts/ops/production-env.mjs";

const revision = "0".repeat(40);
const build = { siteUrl: "https://blog.example.invalid", revision };
const env = {
  SITE_URL: build.siteUrl,
  BETTER_AUTH_URL: build.siteUrl,
  APP_REVISION: revision,
  DATABASE_URL: "postgresql://test:test@postgres:5432/test",
  MEILI_HOST: "http://meilisearch:7700",
  MEILI_MASTER_KEY: "m".repeat(64),
  BETTER_AUTH_SECRET: "s".repeat(64),
  GITHUB_CLIENT_ID: "test",
  GITHUB_CLIENT_SECRET: "test",
  CONTENT_DIR: "/content/current/posts",
  CONTENT_REFRESH_TOKEN: "r".repeat(64),
};

test("production config matches the built domain and release", () => {
  assert.doesNotThrow(() => checkProductionEnv(env, build));
});

test("reject missing secrets and mismatched origins before serving", () => {
  for (const patch of [
    { GITHUB_CLIENT_SECRET: "" },
    { BETTER_AUTH_SECRET: "short" },
    { MEILI_MASTER_KEY: "short" },
    { SITE_URL: "http://blog.example.invalid" },
    { SITE_URL: "https://blog.example.invalid/" },
    { BETTER_AUTH_URL: "http://localhost:3000" },
    {
      SITE_URL: "https://another.example.invalid",
      BETTER_AUTH_URL: "https://another.example.invalid",
    },
    { APP_REVISION: "1".repeat(40) },
    { CONTENT_DIR: "" },
    { CONTENT_DIR: "/etc/content" },
    { CONTENT_REFRESH_TOKEN: "short" },
  ])
    assert.throws(() => checkProductionEnv({ ...env, ...patch }, build));
});
