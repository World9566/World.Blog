import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { parseCover } from "../src/lib/article-cover";
import { collectArticles } from "../src/lib/content-source";
import {
  contentExtrasFingerprint,
  inspectCoverFile,
} from "../src/lib/content-media";
import {
  getArticles,
  readPublishedCover,
  refreshContent,
} from "../src/lib/content";
import { topicsForArticles } from "../src/lib/topics";
import { readTopics } from "../src/lib/topic-source";
import { GET } from "../src/app/media/[...path]/route";

const article = (id: string, options: Record<string, unknown> = {}) => {
  const fields = {
    id,
    slug: id,
    title: id,
    description: "Topic and image fixture",
    publishedAt: "2020-01-01",
    topic: "systems",
    tags: ["Test"],
    draft: false,
    ...options,
  };
  return `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n")}\n---\n\n## Notes\nArticle body.\n`;
};
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "blog-options-"));
  const directory = path.join(root, "posts");
  await mkdir(directory);
  await mkdir(path.join(root, "media"));
  await copyFile(
    "tests/fixtures/media/ci-cover.png",
    path.join(root, "media", "cover.png"),
  );
  return {
    root,
    directory,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("cover metadata accepts optional images and rejects unsafe URL and path forms", () => {
  for (const value of [null, undefined, ""])
    assert.equal(parseCover(value), null);
  for (const value of [
    "layers",
    "/media/covers/photo.webp",
    "https://images.example.com/photo?id=123",
  ])
    assert.equal(parseCover(value), value);
  for (const value of [
    "javascript:alert(1)",
    "data:image/png;base64,AA",
    "//example.com/a.png",
    "http://example.com/a.png",
    "https://user:secret@example.com/a.png",
    "/media/../secret.png",
    "/media/%2e%2e/secret.png",
    "/media/link.svg",
    "/MEDIA/cover.png",
    "/media/back\\slash.png",
    "/private.png",
    123,
  ])
    assert.throws(() => parseCover(value), /cover/);
});

test("topics come only from published articles and optional content-owned names", async () => {
  const f = await fixture();
  try {
    await writeFile(
      path.join(f.root, "topics.json"),
      JSON.stringify([
        { slug: "systems", name: "系统笔记", description: "理解系统" },
        { slug: "empty", name: "空专题" },
      ]),
    );
    for (const [id, options] of Object.entries({
      first: {},
      second: { topic: "another-topic" },
      draft: { topic: "private", draft: true },
      future: { topic: "upcoming", publishedAt: "2099-01-01" },
    }))
      await writeFile(
        path.join(f.directory, `${id}.mdx`),
        article(id, options),
      );
    const topics = topicsForArticles(await collectArticles(f.directory));
    assert.deepEqual(
      topics.map(({ slug, name, count }) => ({ slug, name, count })),
      [
        { slug: "systems", name: "系统笔记", count: 1 },
        { slug: "another-topic", name: "another-topic", count: 1 },
      ],
    );
    for (const invalid of [
      "{",
      "{}",
      '[{"slug":"bad/path","name":"name"}]',
      '[{"slug":"ok","name":""}]',
      '[{"slug":"ok","name":"A"},{"slug":"ok","name":"B"}]',
    ]) {
      await writeFile(path.join(f.root, "topics.json"), invalid);
      await assert.rejects(readTopics(f.directory), /topic|JSON/);
    }
  } finally {
    await f.cleanup();
  }
});

test("local covers fail publication on missing, disguised or linked files", async () => {
  const f = await fixture();
  try {
    await writeFile(
      path.join(f.directory, "first.mdx"),
      article("first", { cover: "/media/missing.png" }),
    );
    await assert.rejects(collectArticles(f.directory), /first.mdx/);
    await writeFile(path.join(f.root, "media", "missing.png"), "not an image");
    await assert.rejects(collectArticles(f.directory), /image extension/);
    await symlink(
      path.join(f.root, "media", "cover.png"),
      path.join(f.root, "media", "link.png"),
    );
    await assert.rejects(
      inspectCoverFile(f.directory, "/media/link.png"),
      /regular file/,
    );
    const result = await inspectCoverFile(f.directory, "/media/cover.png");
    assert.equal(result.contentType, "image/png");
    await writeFile(
      path.join(f.directory, "first.mdx"),
      article("first", { draft: true, cover: "/media/not-ready.png" }),
    );
    assert.deepEqual(await collectArticles(f.directory), []);
  } finally {
    await f.cleanup();
  }
});

test("runtime reloads topic changes and serves only published cover references across releases", async () => {
  const first = await fixture(),
    second = await fixture();
  const saved = process.env.CONTENT_DIR;
  try {
    process.env.CONTENT_DIR = first.directory;
    await writeFile(
      path.join(first.directory, "first.mdx"),
      article("first", { cover: "/media/cover.png" }),
    );
    await copyFile(
      path.join(first.root, "media", "cover.png"),
      path.join(first.root, "media", "private.png"),
    );
    await writeFile(
      path.join(first.directory, "draft.mdx"),
      article("draft", { cover: "/media/private.png", draft: true }),
    );
    await refreshContent();
    const oldFingerprint = await contentExtrasFingerprint(first.directory);
    await writeFile(
      path.join(first.root, "topics.json"),
      '[{"slug":"systems","name":"系统笔记"}]',
    );
    assert.notEqual(
      await contentExtrasFingerprint(first.directory),
      oldFingerprint,
    );
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal((await getArticles())[0].topicName, "系统笔记");
    assert.ok((await readPublishedCover("/media/cover.png"))?.bytes.length);
    assert.equal(await readPublishedCover("/media/private.png"), null);
    const response = await GET(
      new Request("http://localhost/media/cover.png"),
      { params: Promise.resolve({ path: ["cover.png"] }) },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    process.env.CONTENT_DIR = second.directory;
    await writeFile(
      path.join(second.directory, "second.mdx"),
      article("second", { topic: "new-topic" }),
    );
    await refreshContent();
    assert.equal(await readPublishedCover("/media/cover.png"), null);
    assert.deepEqual(
      topicsForArticles(await getArticles()).map(({ slug }) => slug),
      ["new-topic"],
    );
    process.env.CONTENT_DIR = first.directory;
    await refreshContent();
    assert.ok(await readPublishedCover("/media/cover.png"));
    assert.equal(
      (
        await GET(new Request("http://localhost/media/private.png"), {
          params: Promise.resolve({ path: ["private.png"] }),
        })
      ).status,
      404,
    );
  } finally {
    if (saved === undefined) delete process.env.CONTENT_DIR;
    else process.env.CONTENT_DIR = saved;
    await first.cleanup();
    await second.cleanup();
  }
});
