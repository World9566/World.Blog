import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectArticles } from "../src/lib/content-source";
import { compileArticleSource } from "../src/lib/mdx-compile";
import { contentDirectory } from "./content";

// The authoritative gate before a content release goes live: metadata
// validation plus a full MDX compile of every article, using the same compile
// pipeline the running application renders with. A release that passes here
// cannot fail at render time.
async function main() {
  const directory = contentDirectory();
  const articles = await collectArticles(directory);
  const failures: string[] = [];
  for (const article of articles) {
    try {
      await compileArticleSource(
        await readFile(path.join(directory, article.filename), "utf8"),
      );
    } catch (error) {
      failures.push(
        `${article.filename}: ${
          error instanceof Error ? error.message : "compile failed"
        }`,
      );
    }
  }
  if (failures.length) {
    console.error(`Release check failed:\n${failures.join("\n")}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Release check passed: ${articles.length} articles validated and compiled.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
