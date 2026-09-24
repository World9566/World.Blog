import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import matter from "gray-matter";
import { collectArticles } from "../src/lib/content-source";
import {
  HISTORY_FILE,
  HISTORY_LIMIT,
  sourceHash,
  type ArticleRevision,
  type HistoryManifest,
} from "../src/lib/article-history";
import { contentDirectory } from "./content";

const execute = promisify(execFile);

export function gitReader(directory: string, gitDirectory?: string) {
  return async (...args: string[]): Promise<string> => {
    const location = gitDirectory
      ? ["-c", `safe.directory=${gitDirectory}`, `--git-dir=${gitDirectory}`]
      : ["-c", `safe.directory=${directory}`, "-C", directory];
    const { stdout } = await execute(
      "git",
      ["--no-pager", "--literal-pathspecs", ...location, ...args],
      {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: 30000,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
        },
      },
    );
    return stdout;
  };
}

// Runs only during publication or local development, never in a web request.
// The maintenance container receives the object database as a read-only mount.
export async function buildArticleHistory(
  directory: string,
  revision: string,
  gitDirectory?: string,
): Promise<HistoryManifest> {
  if (!/^[a-f0-9]{40}$/.test(revision))
    throw new Error("A full content commit SHA is required");
  const git = gitReader(path.resolve(directory, ".."), gitDirectory);
  const shallow =
    (await git("rev-parse", "--is-shallow-repository")).trim() === "true";
  const articles = await collectArticles(directory, new Date(), {
    includeFuture: true,
  });
  const manifest: HistoryManifest = { version: 1, revision, articles: [] };
  for (const article of articles) {
    let filename = `posts/${article.filename}`;
    const source = await readFile(
      path.join(directory, article.filename),
      "utf8",
    );
    // Uncommitted files are not a Git version, and must not inherit another
    // article's records when a filename is reused during local writing.
    const committed = await git("show", `${revision}:${filename}`).catch(
      () => null,
    );
    if (committed === null || sourceHash(committed) !== sourceHash(source))
      if (gitDirectory)
        throw new Error(
          `Release content differs from Git: ${article.filename}`,
        );
      else continue;
    const commits = (
      await git(
        "log",
        "--follow",
        "--first-parent",
        "--format=%H",
        `--max-count=${HISTORY_LIMIT + 1}`,
        revision,
        "--",
        filename,
      )
    )
      .trim()
      .split("\n")
      .filter(Boolean);
    const entries: ArticleRevision[] = [];
    for (const sha of commits.slice(0, HISTORY_LIMIT)) {
      const metadata = (
        await git("show", "--no-patch", "--format=%cI%x00%s%x00%P", sha)
      )
        .trimEnd()
        .split("\0");
      const historicalSource = await git("show", `${sha}:${filename}`).catch(
        (error: { stderr?: string }) => {
          // --follow also detects copies. The destination has no version in
          // commits before that copy; those belong to the source article.
          if (
            error.stderr?.includes("does not exist in") ||
            error.stderr?.includes("exists on disk, but not in")
          )
            return null;
          throw error;
        },
      );
      if (historicalSource === null) break;
      let data: Record<string, unknown> = {};
      try {
        data = matter(historicalSource).data;
      } catch {
        // A malformed draft in the past must not block a corrected release.
      }
      if (typeof data.id === "string" && data.id.trim() !== article.id) break;
      if (
        typeof data.id === "string" &&
        data.id.trim() === article.id &&
        data.draft === false &&
        typeof data.publishedAt === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(data.publishedAt)
      ) {
        entries.push({
          revision: sha,
          committedAt: metadata[0],
          summary: metadata[1]
            .replace(/[\u0000-\u001f\u007f]/g, " ")
            .slice(0, 300),
          publishedAt: data.publishedAt,
        });
      }
      const parent = metadata[2]?.split(" ")[0];
      const changes = (
        await git(
          "diff-tree",
          "--root",
          "--no-commit-id",
          "-r",
          "-M",
          "--name-status",
          "-z",
          ...(parent ? [parent, sha] : [sha]),
        )
      ).split("\0");
      for (let index = 0; index < changes.length - 1;) {
        const status = changes[index++],
          oldPath = changes[index++];
        if (status.startsWith("R") || status.startsWith("C")) {
          const newPath = changes[index++];
          if (status.startsWith("R") && newPath === filename)
            filename = oldPath;
        }
      }
    }
    manifest.articles.push({
      id: article.id,
      sourceHash: sourceHash(source),
      entries,
      truncated: shallow || commits.length > HISTORY_LIMIT,
    });
  }
  return manifest;
}

export async function writeArticleHistory(
  directory: string,
  manifest: HistoryManifest,
  destination = path.join(directory, "..", HISTORY_FILE),
) {
  const temporary = `${destination}.${process.pid}.tmp`;
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await writeFile(temporary, JSON.stringify(manifest) + "\n");
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  buildArticleHistory(
    contentDirectory(),
    process.argv[2],
    process.env.CONTENT_GIT_DIR,
  )
    .then((manifest) => process.stdout.write(JSON.stringify(manifest) + "\n"))
    .catch((error) => {
      console.error("Article history generation failed:", error.message);
      process.exitCode = 1;
    });
}
