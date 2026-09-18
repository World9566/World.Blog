import type { MDXComponents } from "mdx/types";
import { CodeBlock } from "@/components/code-block";

const components: MDXComponents = {
  pre: CodeBlock,
  table: (props) => (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="文章表格"
    >
      <table {...props} />
    </div>
  ),
  a: ({ href, children, ...props }) => (
    <a
      href={href}
      {...props}
      {...(href?.startsWith("https://")
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    >
      {children}
    </a>
  ),
  Callout: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title?: string;
  }) => (
    <aside className="article-callout">
      {title && <strong>{title}</strong>}
      {children}
    </aside>
  ),
};

// Exported for the runtime MDX pipeline, which passes the map explicitly to
// the evaluated article component.
export const mdxComponentMap: MDXComponents = components;

export function useMDXComponents(): MDXComponents {
  return components;
}
