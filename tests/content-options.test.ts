import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
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

test("topic covers accept local and HTTPS images and reject unsupported forms", async () => {
  const f = await fixture();
  const filename = path.join(f.root, "topics.json");
  try {
    for (const cover of [
      undefined,
      null,
      "",
      "/media/cover.png",
      "https://images.example.com/topic.webp",
    ]) {
      await writeFile(
        filename,
        JSON.stringify([{ slug: "systems", name: "系统笔记", cover }]),
      );
      assert.equal(
        (await readTopics(f.directory)).get("systems")?.cover,
        cover || null,
      );
    }
    for (const cover of [
      "layers",
      "cube",
      "media/cover.png",
      "/media/../secret.png",
      "/media/%2e%2e/secret.png",
      "/media/topic.svg",
      "http://example.com/a.png",
      "https://user:secret@example.com/a.png",
      "data:image/png;base64,AA",
      "javascript:alert(1)",
      12,
      {},
    ]) {
      await writeFile(
        filename,
        JSON.stringify([{ slug: "systems", name: "系统笔记", cover }]),
      );
      await assert.rejects(
        readTopics(f.directory),
        /Invalid topic cover \(systems\)/,
      );
    }
  } finally {
    await f.cleanup();
  }
});

test("publication validates topic image files, including scheduled articles", async () => {
  const f = await fixture();
  try {
    const topicFile = path.join(f.root, "topics.json");
    const postFile = path.join(f.directory, "first.mdx");
    await writeFile(
      topicFile,
      JSON.stringify([
        { slug: "systems", name: "系统笔记", cover: "/media/missing.png" },
      ]),
    );
    await writeFile(postFile, article("first", { draft: true }));
    assert.deepEqual(await collectArticles(f.directory), []);
    await writeFile(postFile, article("first"));
    await assert.rejects(
      collectArticles(f.directory),
      /first.mdx.*missing.png/,
    );
    await writeFile(path.join(f.root, "media", "missing.png"), "not an image");
    await assert.rejects(collectArticles(f.directory), /image extension/);
    await symlink(
      path.join(f.root, "media", "cover.png"),
      path.join(f.root, "media", "link.png"),
    );
    await writeFile(
      topicFile,
      JSON.stringify([
        { slug: "systems", name: "系统笔记", cover: "/media/link.png" },
      ]),
    );
    await assert.rejects(collectArticles(f.directory), /regular file/);
    await writeFile(
      topicFile,
      JSON.stringify([
        { slug: "systems", name: "系统笔记", cover: "/media/cover.png" },
      ]),
    );
    const current = await collectArticles(f.directory);
    assert.equal(current[0].cover, null);
    assert.equal(current[0].topicCover, "/media/cover.png");
    assert.equal(topicsForArticles(current)[0].cover, "/media/cover.png");
    await writeFile(postFile, article("first", { publishedAt: "2099-01-01" }));
    await writeFile(
      topicFile,
      JSON.stringify([
        { slug: "systems", name: "系统笔记", cover: "/media/not-ready.png" },
      ]),
    );
    await assert.rejects(collectArticles(f.directory), /not-ready.png/);
  } finally {
    await f.cleanup();
  }
});

test("topic media follows published topics, metadata edits, release switches and publication day", async (t) => {
  const first = await fixture(),
    second = await fixture();
  const saved = process.env.CONTENT_DIR;
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-25T00:00:00Z"),
  });
  try {
    process.env.CONTENT_DIR = first.directory;
    const topics = [
      { slug: "systems", name: "系统笔记", cover: "/media/cover.png" },
      { slug: "empty", name: "空专题", cover: "/media/empty.png" },
      { slug: "private", name: "草稿专题", cover: "/media/private.png" },
      { slug: "upcoming", name: "未来专题", cover: "/media/future.png" },
    ];
    for (const name of ["empty", "private", "future", "replacement"]) {
      await copyFile(
        path.join(first.root, "media", "cover.png"),
        path.join(first.root, "media", `${name}.png`),
      );
    }
    const topicFile = path.join(first.root, "topics.json");
    await writeFile(topicFile, JSON.stringify(topics));
    await writeFile(
      path.join(first.directory, "current.mdx"),
      article("current"),
    );
    await writeFile(
      path.join(first.directory, "draft.mdx"),
      article("draft", { topic: "private", draft: true }),
    );
    await writeFile(
      path.join(first.directory, "future.mdx"),
      article("future", { topic: "upcoming", publishedAt: "2099-01-01" }),
    );
    const media = (name: string) =>
      GET(new Request(`http://localhost/media/${name}.png`), {
        params: Promise.resolve({ path: [`${name}.png`] }),
      });
    await refreshContent();
    assert.equal((await media("cover")).status, 200);
    for (const name of ["empty", "private", "future"])
      assert.equal((await media(name)).status, 404);
    topics[0].cover = "/media/replacement.png";
    await writeFile(topicFile, JSON.stringify(topics));
    t.mock.timers.setTime(Date.parse("2026-09-25T00:00:02Z"));
    assert.equal(
      topicsForArticles(await getArticles())[0].cover,
      "/media/replacement.png",
    );
    assert.equal((await media("cover")).status, 404);
    const image = await media("replacement");
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal(
      image.headers.get("cache-control"),
      "private, no-cache, must-revalidate",
    );
    assert.ok((await image.arrayBuffer()).byteLength > 0);
    process.env.CONTENT_DIR = second.directory;
    await writeFile(
      path.join(second.directory, "second.mdx"),
      article("second"),
    );
    await refreshContent();
    assert.equal((await media("replacement")).status, 404);
    process.env.CONTENT_DIR = first.directory;
    await refreshContent();
    assert.equal((await media("replacement")).status, 200);
    t.mock.timers.setTime(Date.parse("2098-12-31T16:00:02Z"));
    assert.equal((await media("future")).status, 200);
    assert.equal((await media("empty")).status, 404);
    assert.equal((await media("private")).status, 404);
  } finally {
    if (saved === undefined) delete process.env.CONTENT_DIR;
    else process.env.CONTENT_DIR = saved;
    await first.cleanup();
    await second.cleanup();
  }
});

test("media revalidation saves bytes without retaining replaced or unpublished covers", async () => {
  const f = await fixture();
  const saved = process.env.CONTENT_DIR;
  try {
    process.env.CONTENT_DIR = f.directory;
    const post = path.join(f.directory, "first.mdx");
    await writeFile(post, article("first", { cover: "/media/cover.png" }));
    await refreshContent();
    const get = (etag?: string) =>
      GET(
        new Request("http://localhost/media/cover.png", {
          headers: etag ? { "If-None-Match": etag } : {},
        }),
        { params: Promise.resolve({ path: ["cover.png"] }) },
      );
    const original = await get();
    const etag = original.headers.get("etag")!;
    assert.match(etag, /^"[a-f0-9]{64}"$/);
    assert.ok((await original.arrayBuffer()).byteLength > 0);
    for (const match of [etag, `W/${etag}`, `"other", W/${etag}`, "*"]) {
      const cached = await get(match);
      assert.equal(cached.status, 304);
      assert.equal(cached.headers.get("etag"), etag);
      assert.equal(
        cached.headers.get("cache-control"),
        "private, no-cache, must-revalidate",
      );
      assert.equal((await cached.arrayBuffer()).byteLength, 0);
    }
    assert.equal((await get('"different"')).status, 200);
    const imageFile = path.join(f.root, "media", "cover.png");
    const bytes = await readFile(imageFile);
    await writeFile(imageFile, Buffer.concat([bytes, Buffer.from("changed")]));
    await refreshContent();
    const changed = await get(etag);
    assert.equal(changed.status, 200);
    const changedTag = changed.headers.get("etag")!;
    assert.notEqual(changedTag, etag);
    await writeFile(imageFile, bytes);
    await refreshContent();
    const restored = await get(changedTag);
    assert.equal(restored.status, 200);
    assert.equal(restored.headers.get("etag"), etag);
    await writeFile(
      post,
      article("first", { cover: "/media/cover.png", draft: true }),
    );
    await refreshContent();
    for (const match of [etag, "*"]) {
      const unpublished = await get(match);
      assert.equal(unpublished.status, 404);
      assert.equal(unpublished.headers.get("cache-control"), "no-store");
    }
  } finally {
    if (saved === undefined) delete process.env.CONTENT_DIR;
    else process.env.CONTENT_DIR = saved;
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
    assert.equal(
      response.headers.get("cache-control"),
      "private, no-cache, must-revalidate",
    );
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
