import "dotenv/config";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { contentDirectory, validateContent } from "./content";
import { syncSearch } from "./search-sync";
import { HISTORY_FILE } from "../src/lib/article-history";
import { contentExtrasFingerprint } from "../src/lib/content-media";
import {
  buildArticleHistory,
  gitReader,
  writeArticleHistory,
} from "./content-history";

async function contentRevision() {
  const root = path.resolve(contentDirectory(), "..");
  if (!(await stat(path.join(root, ".git")).catch(() => null))) return "";
  return (await gitReader(root)("rev-parse", "HEAD")).trim();
}

async function fingerprint() {
  try {
    const hash = createHash("sha256");
    const directory = contentDirectory();
    for (const name of (await readdir(directory))
      .filter((name) => name.endsWith(".mdx"))
      .sort()) {
      hash.update(name).update(await readFile(path.join(directory, name)));
    }
    hash.update(await contentRevision().catch(() => "unavailable"));
    hash.update(await contentExtrasFingerprint(directory));
    return hash.digest("hex");
  } catch (error) {
    // A missing content clone must not kill the dev server; clone the content
    // repository into content/ to write articles locally.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

async function main() {
  // Keep generated metadata out of the separately versioned content clone.
  process.env.CONTENT_HISTORY_FILE = path.resolve(".cache", HISTORY_FILE);
  let last = await fingerprint();
  let retrySearch = false;
  let retryHistory = false;
  let busy = false;
  async function rebuild() {
    const articles = await validateContent({ includeFuture: true });
    try {
      const revision = await contentRevision();
      if (revision)
        await writeArticleHistory(
          contentDirectory(),
          await buildArticleHistory(contentDirectory(), revision),
          process.env.CONTENT_HISTORY_FILE,
        );
      else await rm(process.env.CONTENT_HISTORY_FILE!, { force: true });
      retryHistory = false;
    } catch (error) {
      retryHistory = true;
      console.warn(
        "Article history sync failed:",
        error instanceof Error ? error.message : "",
      );
    }
    try {
      await syncSearch(articles);
      retrySearch = false;
    } catch (error) {
      retrySearch = true;
      console.warn(
        "Search sync failed; local search remains available.",
        error instanceof Error ? error.message : "",
      );
    }
  }
  await rebuild();
  const server = spawn(
    "pnpm",
    ["exec", "next", "dev", "--webpack", "--hostname", "0.0.0.0"],
    { stdio: "inherit" },
  );
  let ticks = 0;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const current = await fingerprint();
      if (
        current !== last ||
        ((retrySearch || retryHistory) && ++ticks % 30 === 0)
      ) {
        last = current;
        await rebuild();
      }
    } catch (error) {
      console.error(
        "Content update failed:",
        error instanceof Error ? error.message : "",
      );
    } finally {
      busy = false;
    }
  }, 1000);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      clearInterval(timer);
      server.kill(signal);
    });
  server.on("exit", (code) => {
    clearInterval(timer);
    process.exit(code ?? 0);
  });
  server.on("error", (error) => {
    clearInterval(timer);
    console.error(error.message);
    process.exit(1);
  });
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
