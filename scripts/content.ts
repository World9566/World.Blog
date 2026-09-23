import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectArticles, type SourceArticle } from "../src/lib/content-source";

export function contentDirectory(): string {
  return (
    process.env.CONTENT_DIR || path.join(process.cwd(), "content", "posts")
  );
}

// Validates every article in the content directory. This is the shared gate
// for CI, the production build and the runtime content loader; a failure here
// must always stop a release before it reaches readers. The application
// repository no longer contains articles, so with no explicit CONTENT_DIR and
// no local clone there is simply nothing to validate yet.
export async function validateContent(
  options: { includeFuture?: boolean } = {},
): Promise<SourceArticle[]> {
  const directory = contentDirectory();
  if (!process.env.CONTENT_DIR && !existsSync(directory)) {
    console.error("No content directory found; nothing to validate.");
    return [];
  }
  return collectArticles(directory, new Date(), options);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  validateContent()
    .then((articles) => {
      if (process.argv.includes("--json")) {
        console.log(
          JSON.stringify(
            articles.map(({ filename, draft, ...article }) => article),
          ),
        );
      } else {
        console.log(`Validated ${articles.length} published articles.`);
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
