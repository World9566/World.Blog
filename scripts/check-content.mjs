import "dotenv/config";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const base = process.env.CHECK_BASE_URL || "http://127.0.0.1:3000";
// The expected article set comes from validating the content directory with
// the same rules the runtime loader applies, not from any build-time output.
const articles = JSON.parse(
  execFileSync("pnpm", ["exec", "tsx", "scripts/content.ts", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }),
);
const visible = (html) =>
  html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const htmlText = (value) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#x27;",
      })[character],
  );

async function page(route, status = 200) {
  const response = await fetch(new URL(route, base), {
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, status, route);
  return visible(await response.text());
}

for (const route of [
  "/",
  "/articles",
  "/topics",
  "/about",
  "/search",
  "/articles?page=999999",
  "/articles?topic=web",
]) {
  await page(route);
}
for (const article of articles) {
  const html = await page(`/articles/${article.slug}`);
  assert.ok(html.includes(htmlText(article.title)), `${article.slug} title`);
  assert.ok(html.includes("world9566"), `${article.slug} author`);
  await page(`/topics/${article.topic}`);
}
await page("/articles/no-such-article-smoke-test", 404);
await page("/topics/no-such-topic-smoke-test", 404);

const feed = await page("/feed.xml");
assert.equal(
  (feed.match(/<item>/g) || []).length,
  articles.length,
  "RSS item count",
);
const sitemap = await page("/sitemap.xml");
for (const article of articles)
  assert.ok(sitemap.includes(`/articles/${article.slug}`), "sitemap article");

const query = articles[0]?.tags[0];
if (query) {
  const result = await page(`/search?${new URLSearchParams({ q: query })}`);
  assert.ok(
    result.includes(htmlText(articles[0].title)),
    "search finds published content",
  );
}
const noResults = await page("/search?q=zzzz-nonexistent-blog-smoke-9566");
assert.ok(noResults.includes("还没找到相关内容"), "search empty state");
const tooLong = await page(`/search?q=${"x".repeat(121)}`);
assert.ok(tooLong.includes("关键词有点长"), "search length limit");
const hostile = '<img src=x onerror="alert(1)">';
assert.ok(
  !(await page(`/search?${new URLSearchParams({ q: hostile })}`)).includes(
    hostile,
  ),
  "search escapes user input",
);

if (!process.env.SKIP_SEARCH_INDEX_CHECK) {
  const headers = {
    Authorization: `Bearer ${process.env.MEILI_MASTER_KEY}`,
    "Content-Type": "application/json",
  };
  const response = await fetch(
    new URL("/indexes/blog_articles/search", process.env.MEILI_HOST),
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        q: "",
        limit: Math.max(20, articles.length),
        filter: `publishedDay <= ${new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })
          .format(new Date())
          .replaceAll("-", "")}`,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  assert.equal(response.status, 200, "Meilisearch request");
  const { hits } = await response.json();
  assert.deepEqual(
    hits.map(({ id }) => id).sort(),
    articles.map(({ id }) => id).sort(),
    "index matches published content",
  );
  assert.ok(
    hits.every(
      (hit) => Object.keys(hit).length === 1 && typeof hit.id === "string",
    ),
    "search only returns ids",
  );
}
console.log(
  `Content smoke check passed: ${articles.length} articles, routes, search, RSS, sitemap, input validation${process.env.SKIP_SEARCH_INDEX_CHECK ? " (local search)" : ", and index consistency"}.`,
);
