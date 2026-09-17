import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { collectArticles, parseArticle } from "../src/lib/content-source";

function article(
  overrides: Record<string, unknown> = {},
  body = "## 原理\n\n持久化数据与应用生命周期独立。",
) {
  const fields = {
    id: "post_example",
    slug: "example",
    title: "示例文章",
    description: "文章摘要",
    publishedAt: "2026-09-15",
    topic: "engineering",
    tags: ["Docker"],
    cover: "layers",
    draft: false,
    ...overrides,
  };
  return `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n")}\n---\n\n${body}\n`;
}

async function withDirectory(
  files: Record<string, string>,
  run: (directory: string) => Promise<void>,
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "blog-content-test-"));
  try {
    await Promise.all(
      Object.entries(files).map(([name, source]) =>
        writeFile(path.join(directory, name), source),
      ),
    );
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("only published articles appear, with the publication day evaluated in Shanghai", async () => {
  await withDirectory(
    {
      "published.mdx": article(),
      "draft.mdx": article({ id: "draft", slug: "draft", draft: true }),
      "future.mdx": article({
        id: "future",
        slug: "future",
        publishedAt: "2026-09-16",
      }),
      "earlier.mdx": article({
        id: "earlier",
        slug: "earlier",
        publishedAt: "2026-09-14",
      }),
    },
    async (directory) => {
      assert.deepEqual(
        (
          await collectArticles(directory, new Date("2026-09-14T16:00:00Z"))
        ).map(({ slug }) => slug),
        ["example", "earlier"],
      );
      assert.deepEqual(
        (
          await collectArticles(directory, new Date("2026-09-14T15:59:59Z"))
        ).map(({ slug }) => slug),
        ["earlier"],
      );
    },
  );
});

test("duplicate permanent ids and URL slugs fail validation, including drafts", async () => {
  for (const [override, expected] of [
    [{ slug: "other", draft: true }, /Duplicate article id/],
    [{ id: "other", draft: true }, /Duplicate article slug/],
  ] as const) {
    await withDirectory(
      { "first.mdx": article(), "second.mdx": article(override) },
      async (directory) => {
        await assert.rejects(collectArticles(directory), expected);
      },
    );
  }
});

test("metadata errors fail before rendering or indexing", () => {
  const invalid: [Record<string, unknown>, RegExp][] = [
    [{ draft: "false" }, /draft/],
    [{ publishedAt: "2026-02-30" }, /publishedAt/],
    [{ updatedAt: "2026-09-14" }, /updatedAt/],
    [{ slug: "../private" }, /slug/],
    [{ id: "unsafe id" }, /id/],
    [{ topic: "missing" }, /topic/],
    [{ tags: [] }, /tags/],
    [{ featured: "true" }, /featured/],
    [{ cover: "missing" }, /cover/],
  ];
  for (const [fields, expected] of invalid)
    assert.throws(() => parseArticle(article(fields), "example.mdx"), expected);
  assert.throws(
    () => parseArticle(article().replace("draft: false\n", ""), "example.mdx"),
    /draft/,
  );
  assert.throws(
    () => parseArticle(article({}, "# 重复标题"), "example.mdx"),
    /level 2/,
  );
  assert.throws(() => parseArticle(article({}, ""), "example.mdx"), /empty/);
});

test("plain text indexes prose and code but excludes MDX imports and expressions", () => {
  const result = parseArticle(
    article(
      {},
      `import Widget from './private-module';

export const internal = "not-for-search";

## 缓存与数据

正文包含**持久化**。

<Callout title="提示">可以搜索这段内容。</Callout>

{"hidden-expression"}

\`\`\`ts
const cache = new Map();
\`\`\`

## 缓存与数据

### 下一步

![架构图](/architecture.svg)`,
    ),
    "example.mdx",
  );
  assert.match(result.text, /持久化/);
  assert.match(result.text, /可以搜索这段内容/);
  assert.match(result.text, /const cache = new Map/);
  assert.match(result.text, /架构图/);
  assert.doesNotMatch(
    result.text,
    /private-module|not-for-search|hidden-expression/,
  );
  assert.deepEqual(
    result.headings.map(({ id }) => id),
    ["缓存与数据", "缓存与数据-1", "下一步"],
  );
  assert.equal(result.readingMinutes, 1);
});

test("unsafe filenames are rejected with an actionable error", async () => {
  await withDirectory({ "Bad Name.mdx": article() }, async (directory) => {
    await assert.rejects(
      collectArticles(directory),
      /Invalid article filename: Bad Name.mdx/,
    );
  });
});
