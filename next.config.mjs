import createMDX from "@next/mdx";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode from "rehype-pretty-code";

const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkGfm, remarkFrontmatter],
    rehypePlugins: [
      rehypeSlug,
      [rehypePrettyCode, { theme: "github-light", keepBackground: false }],
    ],
  },
});

export default withMDX({
  output: "standalone",
  deploymentId: process.env.REVISION || undefined,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  pageExtensions: ["js", "jsx", "ts", "tsx", "mdx"],
  poweredByHeader: false,
  devIndicators: false,
});
