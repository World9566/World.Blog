import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildArticleHistory,
  writeArticleHistory,
} from "../scripts/content-history";
import { HISTORY_FILE, readArticleHistories } from "../src/lib/article-history";
import { getArticleHistory, refreshContent } from "../src/lib/content";

const source = (
  body: string,
  options: { id?: string; draft?: boolean; date?: string } = {},
) => `---
id: "${options.id ?? "post_history"}"
slug: "history-test"
title: "History test"
description: "Article history fixture"
publishedAt: "${options.date ?? "2020-01-01"}"
topic: "engineering"
tags: ["Git"]
cover: "branches"
draft: ${options.draft ?? false}
---
## Version history
${body}
`;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "blog-history-"));
  const directory = path.join(root, "posts");
  await mkdir(directory);
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "--quiet");
  let filename = "original.mdx";
  const commit = async (
    body: string,
    summary: string,
    options: Parameters<typeof source>[1] = {},
  ) => {
    await writeFile(path.join(directory, filename), source(body, options));
    git("add", "posts");
    git(
      "-c",
      "user.name=History Tester",
      "-c",
      "user.email=private@example.invalid",
      "commit",
      "--quiet",
      "-m",
      summary,
    );
    return git("rev-parse", "HEAD");
  };
  return {
    root,
    directory,
    git,
    commit,
    async rename() {
      await rename(
        path.join(directory, filename),
        path.join(directory, "renamed.mdx"),
      );
      filename = "renamed.mdx";
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("history follows renames, excludes draft revisions and serializes only public metadata", async () => {
  const f = await fixture();
  try {
    await f.commit("Private draft", "private draft message", { draft: true });
    const first = await f.commit("Public article", "First publication");
    await f.rename();
    const renamed = await f.commit("Public article", "Rename the article");
    const latest = await f.commit(
      "Improved article",
      '<img src=x onerror="alert(1)"> & details',
    );
    const manifest = await buildArticleHistory(f.directory, latest);
    assert.deepEqual(
      manifest.articles[0].entries.map((entry) => entry.revision),
      [latest, renamed, first],
    );
    const serialized = JSON.stringify(manifest);
    assert.ok(!serialized.includes("private@example.invalid"));
    assert.ok(!serialized.includes("Private draft"));
    assert.ok(!serialized.includes("private draft message"));
    assert.ok(!serialized.includes("Improved article"));
    await writeArticleHistory(f.directory, manifest);
    assert.deepEqual(
      await readArticleHistories(f.directory),
      manifest.articles,
    );
    // Production reads a detached object's database, not the web container's
    // mount of the worktree (whose .git pointer is a host-only absolute path).
    assert.deepEqual(
      await buildArticleHistory(f.directory, latest, path.join(f.root, ".git")),
      manifest,
    );
  } finally {
    await f.cleanup();
  }
});

test("history is pinned to the selected release and does not include later commits", async () => {
  const f = await fixture();
  try {
    const first = await f.commit("Original", "First publication");
    const second = await f.commit("New version", "Later update");
    f.git("checkout", "--quiet", "--detach", first);
    const manifest = await buildArticleHistory(f.directory, first);
    assert.deepEqual(
      manifest.articles[0].entries.map((entry) => entry.revision),
      [first],
    );
    assert.ok(!JSON.stringify(manifest).includes(second));
  } finally {
    await f.cleanup();
  }
});

test("a malformed historical draft does not block a corrected article", async () => {
  const f = await fixture();
  try {
    const first = await f.commit("Public article", "First publication");
    await writeFile(
      path.join(f.directory, "original.mdx"),
      '---\nid: "post_history"\ndraft: [\n---\nUnfinished draft',
    );
    f.git("add", "posts");
    f.git(
      "-c",
      "user.name=Tester",
      "-c",
      "user.email=private@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "Unfinished private draft",
    );
    const latest = await f.commit("Corrected article", "Correct the article");
    assert.deepEqual(
      (await buildArticleHistory(f.directory, latest)).articles[0].entries.map(
        (entry) => entry.revision,
      ),
      [latest, first],
    );
  } finally {
    await f.cleanup();
  }
});

test("Git copy detection does not attach the source article history to a new article", async () => {
  const f = await fixture();
  try {
    await f.commit(
      "Shared article template with enough common text for Git to detect a copy.",
      "Original article",
    );
    await writeFile(
      path.join(f.directory, "copied.mdx"),
      source(
        "Shared article template with enough common text for Git to detect a copy.",
        { id: "post_copy" },
      ).replace('slug: "history-test"', 'slug: "copy-test"'),
    );
    f.git("add", "posts");
    f.git(
      "-c",
      "user.name=Tester",
      "-c",
      "user.email=private@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "New article from template",
    );
    const latest = f.git("rev-parse", "HEAD");
    const manifest = await buildArticleHistory(f.directory, latest);
    assert.deepEqual(
      manifest.articles
        .find((article) => article.id === "post_copy")
        ?.entries.map((entry) => entry.revision),
      [latest],
    );
  } finally {
    await f.cleanup();
  }
});

test("a reused filename cannot inherit a different article's history or describe uncommitted content", async () => {
  const f = await fixture();
  try {
    await f.commit("Previous article", "Old identity", { id: "old_article" });
    const replacement = await f.commit("Replacement", "New identity");
    assert.deepEqual(
      (
        await buildArticleHistory(f.directory, replacement)
      ).articles[0].entries.map((entry) => entry.revision),
      [replacement],
    );
    await writeFile(
      path.join(f.directory, "original.mdx"),
      source("Uncommitted edit"),
    );
    assert.equal(
      (await buildArticleHistory(f.directory, replacement)).articles.length,
      0,
    );
    await assert.rejects(
      buildArticleHistory(f.directory, replacement, path.join(f.root, ".git")),
      /Release content differs from Git/,
    );
  } finally {
    await f.cleanup();
  }
});

test("runtime history respects publication, missing metadata and content changes", async () => {
  const f = await fixture();
  const saved = process.env.CONTENT_DIR;
  process.env.CONTENT_DIR = f.directory;
  try {
    const first = await f.commit("Public", "Visible update");
    const manifest = await buildArticleHistory(f.directory, first);
    manifest.articles[0].entries.unshift({
      revision: "f".repeat(40),
      committedAt: "2099-01-01T00:00:00Z",
      summary: "Future revision",
      publishedAt: "2099-01-01",
    });
    await writeArticleHistory(f.directory, manifest);
    await refreshContent();
    assert.deepEqual(
      (await getArticleHistory("history-test")).entries.map(
        (entry) => entry.revision,
      ),
      [first],
    );
    assert.equal((await getArticleHistory("missing")).entries.length, 0);
    await writeFile(
      path.join(f.directory, "original.mdx"),
      source("Local edit"),
    );
    await refreshContent();
    assert.equal((await getArticleHistory("history-test")).entries.length, 0);
    await writeFile(path.join(f.root, HISTORY_FILE), "broken JSON");
    assert.deepEqual(await readArticleHistories(f.directory), []);
    await rm(path.join(f.root, HISTORY_FILE));
    assert.deepEqual(await readArticleHistories(f.directory), []);
  } finally {
    if (saved === undefined) delete process.env.CONTENT_DIR;
    else process.env.CONTENT_DIR = saved;
    await f.cleanup();
  }
});
