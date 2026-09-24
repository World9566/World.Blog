import "server-only";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { Article } from "./article-types";
import { collectArticles, type SourceArticle } from "./content-source";
import { compileArticleSource, type ArticleComponent } from "./mdx-compile";
import { publicationDate } from "./publication-date";
import {
  historyFile,
  readArticleHistories,
  sourceHash,
  type ArticleHistory,
  type ArticleRevision,
} from "./article-history";

// Content is read at request time from a directory that deploys can switch
// atomically (a symlink swap). Each snapshot pins one resolved release
// directory, so a switch mid-load can never produce a mixed article set.
// Validation failure keeps the last known good snapshot and records the error.
interface Snapshot {
  dir: string;
  fingerprint: string;
  articles: SourceArticle[];
  published: Article[];
  sources: Map<string, string>;
  histories: Map<string, ArticleHistory>;
  components: Map<string, Promise<ArticleComponent>>;
  compileErrors: Map<string, string>;
  loadedAt: number;
}

interface ContentState {
  snapshot: Snapshot | null;
  loadError: string | null;
  lastCheck: number;
  lastDay: string;
  inFlight: Promise<void> | null;
}

const CHECK_INTERVAL = 1000;
const globalStore = globalThis as { __blogContent?: ContentState };
const state: ContentState = (globalStore.__blogContent ??= {
  snapshot: null,
  loadError: null,
  lastCheck: 0,
  lastDay: "",
  inFlight: null,
});

function contentDirectory(): string {
  return (
    process.env.CONTENT_DIR || path.join(process.cwd(), "content", "posts")
  );
}

async function fingerprint(directory: string): Promise<string> {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".mdx"))
    .sort();
  const parts: string[] = [];
  for (const name of names) {
    const info = await stat(path.join(directory, name));
    parts.push(`${name}:${info.mtimeMs}:${info.size}`);
  }
  const history = await stat(historyFile(directory)).catch(() => null);
  parts.push(`history:${history?.mtimeMs ?? 0}:${history?.size ?? 0}`);
  return parts.join("|");
}

async function load(): Promise<void> {
  const configured = contentDirectory();
  try {
    if (!process.env.CONTENT_DIR) {
      // Without an explicit CONTENT_DIR the application repository simply
      // carries no articles (they live in the content repository, cloned for
      // local writing); serve an empty set and pick content up once the
      // directory appears. An explicitly configured directory that is
      // missing is a broken mount and must fail loudly below.
      const present = await stat(configured)
        .then(() => true)
        .catch(() => false);
      if (!present) {
        state.snapshot = {
          dir: "",
          fingerprint: "",
          articles: [],
          published: [],
          sources: new Map(),
          histories: new Map(),
          components: new Map(),
          compileErrors: new Map(),
          loadedAt: Date.now(),
        };
        state.loadError = null;
        return;
      }
    }
    const directory = await realpath(configured).catch(() => {
      // The most likely cause deserves an actionable hint.
      throw Object.assign(
        new Error(`Content directory is missing: ${configured}`),
        {
          hint: "Content is a separate repository; clone it (e.g. into content/) or fix the CONTENT_DIR mount.",
        },
      );
    });
    const published = await collectArticles(directory);
    const sources = new Map<string, string>();
    await Promise.all(
      published.map(async (article) => {
        sources.set(
          article.filename,
          await readFile(path.join(directory, article.filename), "utf8"),
        );
      }),
    );
    const histories = await readArticleHistories(directory);
    state.snapshot = {
      dir: directory,
      fingerprint: await fingerprint(directory),
      articles: published,
      published: published.map(({ filename, draft, ...article }) => article),
      sources,
      histories: new Map(histories.map((history) => [history.id, history])),
      components: new Map(),
      compileErrors: new Map(),
      loadedAt: Date.now(),
    };
    state.loadError = null;
  } catch (error) {
    // Keep the last known good snapshot; with no previous snapshot the site
    // serves an empty article set and the health endpoint reports the error.
    state.loadError =
      error instanceof Error ? error.message : "Content failed to load";
  } finally {
    state.lastDay = publicationDate();
  }
}

async function needsReload(): Promise<boolean> {
  const directory = await realpath(contentDirectory()).catch(() => null);
  if (directory === null) return false;
  const snapshot = state.snapshot;
  if (!snapshot || snapshot.dir !== directory) return true;
  return (await fingerprint(directory)) !== snapshot.fingerprint;
}

async function ensureFresh(force = false): Promise<void> {
  if (state.inFlight) return state.inFlight;
  const now = Date.now();
  if (!force && now - state.lastCheck < CHECK_INTERVAL) return;
  state.lastCheck = now;
  // The publication day is part of the published filter, so crossing a day
  // boundary must re-evaluate future-dated articles without any trigger.
  const day = publicationDate();
  if (!force && state.snapshot && state.lastDay === day) {
    if (!(await needsReload())) return;
  }
  state.inFlight = load().finally(() => {
    state.inFlight = null;
  });
  return state.inFlight;
}

export async function getArticles(): Promise<Article[]> {
  await ensureFresh();
  return state.snapshot?.published ?? [];
}

export async function findArticle(slug: string): Promise<Article | undefined> {
  return (await getArticles()).find((article) => article.slug === slug);
}

export async function getArticleHistory(
  slug: string,
): Promise<{ entries: ArticleRevision[]; truncated: boolean }> {
  await ensureFresh();
  const snapshot = state.snapshot;
  const article = snapshot?.articles.find((item) => item.slug === slug);
  const history = article && snapshot?.histories?.get(article.id);
  const source = article && snapshot?.sources.get(article.filename);
  if (
    !history ||
    source === undefined ||
    history.sourceHash !== sourceHash(source)
  )
    return { entries: [], truncated: false };
  return {
    entries: history.entries.filter(
      (entry) => entry.publishedAt <= publicationDate(),
    ),
    truncated: history.truncated,
  };
}

export async function articlesInTopic(topic: string): Promise<Article[]> {
  return (await getArticles()).filter((article) => article.topic === topic);
}

// API routes locate published articles by their permanent id.
export async function publishedArticle(
  id: string,
): Promise<Article | undefined> {
  return (await getArticles()).find((article) => article.id === id);
}

export async function getArticleComponent(
  slug: string,
): Promise<ArticleComponent | undefined> {
  await ensureFresh();
  const snapshot = state.snapshot;
  if (!snapshot) return undefined;
  const article = snapshot.articles.find((item) => item.slug === slug);
  if (!article) return undefined;
  const source = snapshot.sources.get(article.filename);
  if (source === undefined) return undefined;
  let pending = snapshot.components.get(slug);
  if (!pending) {
    pending = compileArticleSource(source).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Article failed to compile";
      snapshot.compileErrors.set(slug, message);
      throw new Error(`${slug}: ${message}`);
    });
    snapshot.components.set(slug, pending);
  }
  return pending;
}

export function compileError(slug: string): string | undefined {
  return state.snapshot?.compileErrors.get(slug);
}

// Reload and compile every article eagerly. Used by the startup hook and the
// authenticated refresh endpoint so readers never pay the first-compile cost.
export async function refreshContent(): Promise<{
  articles: number;
  errors: string[];
}> {
  await ensureFresh(true);
  const snapshot = state.snapshot;
  const errors = state.loadError ? [state.loadError] : [];
  if (!snapshot) return { articles: 0, errors };
  const settled = await Promise.allSettled(
    snapshot.articles.map((article) => getArticleComponent(article.slug)),
  );
  snapshot.articles.forEach((article, index) => {
    const outcome = settled[index];
    if (outcome.status === "rejected")
      errors.push(`${article.slug}: ${String(outcome.reason)}`);
  });
  return { articles: snapshot.articles.length, errors };
}

export function contentStatus(): {
  articles: number;
  dir: string | null;
  loadedAt: number | null;
  loadError: string | null;
} {
  const snapshot = state.snapshot;
  return {
    articles: snapshot?.articles.length ?? 0,
    dir: snapshot?.dir ?? null,
    loadedAt: snapshot?.loadedAt ?? null,
    loadError: state.loadError,
  };
}
