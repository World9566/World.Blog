import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { ComponentType } from "react";
import type { PluggableList } from "unified";

// The plugin chain mirrors next.config.mjs so runtime-rendered articles match
// what the build-time pipeline produced. Frontmatter is stripped before
// compiling because validation owns that part of the source.
//
// The pipeline is loaded through dynamic imports: under tsx the compiled
// script is CommonJS, and statically requiring the ESM-only MDX graph breaks
// resolution of import-only exports such as estree-walker. Webpack handles
// the same dynamic imports as ordinary code-split chunks.
interface MdxPipeline {
  compile: typeof import("@mdx-js/mdx")["compile"];
  run: typeof import("@mdx-js/mdx")["run"];
  remarkPlugins: PluggableList;
  rehypePlugins: PluggableList;
}

let pipeline: Promise<MdxPipeline> | null = null;

function loadPipeline(): Promise<MdxPipeline> {
  return (pipeline ??= (async () => {
    const [{ compile, run }, remarkGfm, rehypeSlug, rehypePrettyCode] =
      await Promise.all([
        import("@mdx-js/mdx"),
        import("remark-gfm"),
        import("rehype-slug"),
        import("rehype-pretty-code"),
      ]);
    return {
      compile,
      run,
      remarkPlugins: [remarkGfm.default],
      rehypePlugins: [
        rehypeSlug.default,
        [
          rehypePrettyCode.default,
          { theme: "github-light", keepBackground: false },
        ],
      ],
    };
  })());
}

export type ArticleComponent = ComponentType<{
  components?: Record<string, unknown>;
}>;

// Compiling (syntax highlighting included) is the expensive part; running the
// compiled function body is cheap. Cache entries are keyed by the article
// source hash plus the application revision, so image changes and article
// edits never collide. Writes are atomic and best effort: a read-only or
// missing cache only costs compile time.
function cacheDirectory(): string | null {
  const configured = process.env.CONTENT_COMPILE_CACHE;
  return configured && path.isAbsolute(configured) ? configured : null;
}

async function compileBody(content: string): Promise<string> {
  const { compile, remarkPlugins, rehypePlugins } = await loadPipeline();
  return String(
    await compile(content, {
      outputFormat: "function-body",
      remarkPlugins,
      rehypePlugins,
    }),
  );
}

async function storeCache(file: string, code: string): Promise<void> {
  try {
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, code);
    await rename(temp, file);
  } catch {
    // The cache is an optimization; failures to persist are not fatal.
  }
}

async function cachedCode(
  content: string,
): Promise<{ code: string; entry: string | null }> {
  const directory = cacheDirectory();
  if (!directory) return { code: await compileBody(content), entry: null };
  const revision = process.env.APP_REVISION || "local";
  const entry = path.join(
    directory,
    revision,
    `${createHash("sha256").update(content).digest("hex")}.js`,
  );
  try {
    return { code: await readFile(entry, "utf8"), entry };
  } catch {
    const code = await compileBody(content);
    await storeCache(entry, code);
    return { code, entry };
  }
}

async function runCode(code: string): Promise<ArticleComponent> {
  const { run } = await loadPipeline();
  const { default: MDXContent } = await run(code, { Fragment, jsx, jsxs });
  return MDXContent as ArticleComponent;
}

export async function compileArticleSource(
  source: string,
): Promise<ArticleComponent> {
  const { content } = matter(source);
  let { code, entry } = await cachedCode(content);
  try {
    return await runCode(code);
  } catch (error) {
    // A corrupt cache entry heals itself: drop it, recompile and retry once.
    // A genuinely broken article throws again from the fresh compile.
    if (entry === null) throw error;
    await rm(entry, { force: true }).catch(() => {});
    return runCode(await compileBody(content));
  }
}
