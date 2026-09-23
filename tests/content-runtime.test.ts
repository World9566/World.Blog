import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getArticles } from "../src/lib/content";
import { collectArticles } from "../src/lib/content-source";
import { searchArticles } from "../src/lib/search";

test("scheduled content becomes visible and searchable at Shanghai midnight without editing files", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "blog-scheduled-test-"),
  );
  const saved = { ...process.env };
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-23T15:59:50Z"),
  });
  const source = (id: string, date: string, draft = false) => `---
id: "${id}"
slug: "${id}"
title: "Scheduled ${id}"
description: "Calendar test"
publishedAt: "${date}"
topic: "engineering"
tags: ["scheduled"]
cover: "layers"
draft: ${draft}
---
## Calendar test
Scheduled article body.
`;
  try {
    await writeFile(
      path.join(directory, "current.mdx"),
      source("current", "2026-09-23"),
    );
    await writeFile(
      path.join(directory, "future.mdx"),
      source("future", "2026-09-24"),
    );
    await writeFile(
      path.join(directory, "draft.mdx"),
      source("draft", "2026-09-23", true),
    );
    process.env.CONTENT_DIR = directory;
    process.env.MEILI_HOST = "http://search.example.invalid";
    process.env.MEILI_MASTER_KEY = "disposable-test-key";
    const indexed = await collectArticles(directory, new Date(), {
      includeFuture: true,
    });
    assert.deepEqual(indexed.map((article) => article.id).sort(), [
      "current",
      "future",
    ]);
    const filters: string[] = [];
    t.mock.method(
      globalThis,
      "fetch",
      async (_url: unknown, options: RequestInit) => {
        const query = JSON.parse(options.body as string);
        filters.push(query.filter);
        // Even an index returning a future id must not leak it in public results.
        return Response.json({ hits: indexed.map(({ id }) => ({ id })) });
      },
    );
    assert.deepEqual(
      (await getArticles()).map(({ id }) => id),
      ["current"],
    );
    assert.deepEqual(
      (await searchArticles("scheduled", "engineering")).articles.map(
        ({ id }) => id,
      ),
      ["current"],
    );
    assert.equal(
      filters[0],
      'publishedDay <= 20260923 AND topic = "engineering"',
    );
    t.mock.timers.setTime(new Date("2026-09-23T16:00:02Z").getTime());
    assert.deepEqual(
      (await getArticles()).map(({ id }) => id),
      ["future", "current"],
    );
    const result = await searchArticles("scheduled");
    assert.equal(result.source, "meilisearch");
    assert.deepEqual(
      result.articles.map(({ id }) => id),
      ["future", "current"],
    );
    assert.equal(filters[1], "publishedDay <= 20260924");
  } finally {
    for (const key of ["CONTENT_DIR", "MEILI_HOST", "MEILI_MASTER_KEY"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await rm(directory, { recursive: true, force: true });
  }
});
