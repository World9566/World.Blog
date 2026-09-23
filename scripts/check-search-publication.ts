import "dotenv/config";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mock } from "node:test";
import { collectArticles } from "../src/lib/content-source";
import { getArticles } from "../src/lib/content";
import { searchArticles } from "../src/lib/search";
import { prepareSearch, swapSearch, discardSearch } from "./search-sync";

async function main() {
  assert.ok(
    process.env.SITE_URL?.endsWith(".invalid"),
    "Use an isolated rehearsal domain.",
  );
  const directory = await mkdtemp(path.join(os.tmpdir(), "blog-search-check-"));
  const previousDirectory = process.env.CONTENT_DIR;
  let preparation: Awaited<ReturnType<typeof prepareSearch>> | undefined;
  let swapped = false;
  try {
    for (const [id, date, draft] of [
      ["current", "2049-01-01", false],
      ["scheduled", "2050-09-24", false],
      ["draft", "2049-01-01", true],
    ] as const) {
      await writeFile(
        path.join(directory, `${id}.mdx`),
        `---
id: "search_${id}"
slug: "search-${id}"
title: "Calendar ${id}"
description: "Calendar search integration fixture"
publishedAt: "${date}"
topic: "engineering"
tags: ["calendar"]
cover: "layers"
draft: ${draft}
---
## Calendar
Calendar search checks.
`,
      );
    }
    const articles = await collectArticles(directory, new Date(), {
      includeFuture: true,
    });
    assert.equal(
      articles.length,
      2,
      "Drafts are excluded, scheduled articles are indexed",
    );
    preparation = await prepareSearch(articles);
    // Exercise the actual CLI: it must retain the old index until verification.
    execFileSync("pnpm", ["search:swap", preparation.temporary], {
      stdio: "inherit",
    });
    swapped = true;
    const retained = await fetch(
      new URL(`/indexes/${preparation.temporary}`, process.env.MEILI_HOST!),
      {
        headers: { Authorization: `Bearer ${process.env.MEILI_MASTER_KEY}` },
        signal: AbortSignal.timeout(10000),
      },
    );
    assert.equal(retained.status, 200, "The old index survives the CLI swap");
    process.env.CONTENT_DIR = directory;
    mock.timers.enable({
      apis: ["Date"],
      now: new Date("2050-09-23T15:59:50Z"),
    });
    assert.deepEqual(
      (await getArticles()).map(({ id }) => id),
      ["search_current"],
    );
    let result = await searchArticles("calendar", "engineering");
    assert.equal(result.source, "meilisearch");
    assert.deepEqual(
      result.articles.map(({ id }) => id),
      ["search_current"],
    );
    mock.timers.setTime(new Date("2050-09-23T16:00:02Z").getTime());
    result = await searchArticles("calendar", "engineering");
    assert.equal(result.source, "meilisearch");
    assert.deepEqual(result.articles.map(({ id }) => id).sort(), [
      "search_current",
      "search_scheduled",
    ]);
    console.log(
      "Real search checks passed: retained rollback index and automatic Shanghai midnight publication.",
    );
  } finally {
    mock.timers.reset();
    if (previousDirectory === undefined) delete process.env.CONTENT_DIR;
    else process.env.CONTENT_DIR = previousDirectory;
    if (preparation) {
      if (swapped) await swapSearch(preparation);
      await discardSearch(preparation);
      await discardSearch(preparation);
    }
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
