import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectArticles } from "../src/lib/content-source";

async function writeChanged(filename: string, value: string) {
  try {
    if ((await readFile(filename, "utf8")) === value) return;
  } catch {}
  await writeFile(filename, value);
}

export async function generateContent() {
  const articles = await collectArticles(
    path.join(process.cwd(), "content/posts"),
  );
  const directory = path.join(process.cwd(), "src/generated");
  await mkdir(directory, { recursive: true });
  await writeChanged(
    path.join(directory, "articles.json"),
    JSON.stringify(
      articles.map(({ filename, draft, ...article }) => article),
      null,
      2,
    ) + "\n",
  );
  const loaders = articles
    .map(
      (article) =>
        `  ${JSON.stringify(article.slug)}: () => import(${JSON.stringify(`../../content/posts/${article.filename}`)}),`,
    )
    .join("\n");
  await writeChanged(
    path.join(directory, "article-loaders.ts"),
    `// Generated from published MDX. Do not edit.\nimport type { ComponentType } from "react";\nexport const articleLoaders: Record<string, () => Promise<{ default: ComponentType }>> = {\n${loaders}\n};\n`,
  );
  return articles;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  generateContent()
    .then((articles) =>
      console.log(`Validated ${articles.length} published articles.`),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
