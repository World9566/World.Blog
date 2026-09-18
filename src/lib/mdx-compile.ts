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
  evaluate: typeof import("@mdx-js/mdx")["evaluate"];
  remarkPlugins: PluggableList;
  rehypePlugins: PluggableList;
}

let pipeline: Promise<MdxPipeline> | null = null;

function loadPipeline(): Promise<MdxPipeline> {
  return (pipeline ??= (async () => {
    const [{ evaluate }, remarkGfm, rehypeSlug, rehypePrettyCode] =
      await Promise.all([
        import("@mdx-js/mdx"),
        import("remark-gfm"),
        import("rehype-slug"),
        import("rehype-pretty-code"),
      ]);
    return {
      evaluate,
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

export async function compileArticleSource(
  source: string,
): Promise<ArticleComponent> {
  const { content } = matter(source);
  const { evaluate, remarkPlugins, rehypePlugins } = await loadPipeline();
  // evaluate compiles the body itself into a function body and runs it,
  // so the returned component shares the React runtime of this process.
  const { default: MDXContent } = await evaluate(content, {
    Fragment,
    jsx,
    jsxs,
    remarkPlugins,
    rehypePlugins,
  });
  return MDXContent as ArticleComponent;
}
