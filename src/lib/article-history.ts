import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const HISTORY_FILE = ".article-history.json";
export const HISTORY_LIMIT = 100;

export function historyFile(directory: string): string {
  return (
    process.env.CONTENT_HISTORY_FILE || path.join(directory, "..", HISTORY_FILE)
  );
}

export interface ArticleRevision {
  revision: string;
  committedAt: string;
  summary: string;
  publishedAt: string;
}

export interface ArticleHistory {
  id: string;
  sourceHash: string;
  entries: ArticleRevision[];
  truncated: boolean;
}

export interface HistoryManifest {
  version: 1;
  revision: string;
  articles: ArticleHistory[];
}

export function sourceHash(source: string): string {
  // Git checkouts on Windows and Linux may use different line endings.
  return createHash("sha256")
    .update(source.replaceAll("\r\n", "\n"))
    .digest("hex");
}

export async function readArticleHistories(
  directory: string,
): Promise<ArticleHistory[]> {
  try {
    const manifest: HistoryManifest = JSON.parse(
      await readFile(historyFile(directory), "utf8"),
    );
    if (
      manifest.version !== 1 ||
      !/^[a-f0-9]{40}$/.test(manifest.revision) ||
      !Array.isArray(manifest.articles)
    )
      return [];
    return manifest.articles.filter(
      (article) =>
        typeof article.id === "string" &&
        /^[a-f0-9]{64}$/.test(article.sourceHash) &&
        typeof article.truncated === "boolean" &&
        Array.isArray(article.entries) &&
        article.entries.length <= HISTORY_LIMIT &&
        article.entries.every(
          (entry) =>
            /^[a-f0-9]{40}$/.test(entry.revision) &&
            typeof entry.committedAt === "string" &&
            Number.isFinite(Date.parse(entry.committedAt)) &&
            typeof entry.summary === "string" &&
            entry.summary.length <= 300 &&
            /^\d{4}-\d{2}-\d{2}$/.test(entry.publishedAt),
        ),
    );
  } catch {
    // Older releases and local, uncommitted articles may have no history.
    // A missing or damaged sidecar must never prevent reading the article.
    return [];
  }
}
