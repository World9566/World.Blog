import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import GithubSlugger from "github-slugger";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkGfm from "remark-gfm";
import { toString } from "mdast-util-to-string";
import type { Root, RootContent } from "mdast";
import type { Article, ArticleCover, Heading } from "./article-types";
import { getTopic, type TopicSlug } from "./site";

const parser = unified().use(remarkParse).use(remarkMdx).use(remarkGfm);
const covers: ArticleCover[] = ["layers", "branches", "brackets", "search"];
export interface SourceArticle extends Article {
  filename: string;
  draft: boolean;
}

function field(data: Record<string, unknown>, name: string, max = 160): string {
  const value = data[name];
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(
      `Invalid ${name}: expected a non-empty string up to ${max} characters`,
    );
  }
  return value.trim();
}

function dateField(data: Record<string, unknown>, name: string): string {
  const value = field(data, name, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Invalid ${name}: use a quoted YYYY-MM-DD date`);
  }
  return value;
}

function plainText(node: Root | RootContent): string {
  if (
    node.type === "mdxjsEsm" ||
    node.type === "mdxFlowExpression" ||
    node.type === "mdxTextExpression"
  )
    return "";
  if (
    node.type === "text" ||
    node.type === "inlineCode" ||
    node.type === "code"
  )
    return node.value;
  if (node.type === "image") return node.alt || "";
  if ("children" in node)
    return node.children
      .map((child) => plainText(child as RootContent))
      .join(" ");
  return "";
}

export function parseArticle(source: string, filename: string): SourceArticle {
  const { data, content } = matter(source);
  const id = field(data, "id", 80);
  const slug = field(data, "slug", 100);
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error("Invalid article id");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error("Invalid article slug");
  const topic = field(data, "topic");
  if (!getTopic(topic)) throw new Error(`Unknown topic: ${topic}`);
  if (typeof data.draft !== "boolean")
    throw new Error("draft must be explicitly true or false");
  if (data.featured !== undefined && typeof data.featured !== "boolean")
    throw new Error("featured must be a boolean");
  if (
    !Array.isArray(data.tags) ||
    data.tags.length < 1 ||
    data.tags.length > 6 ||
    data.tags.some(
      (tag) => typeof tag !== "string" || !tag.trim() || tag.length > 30,
    )
  ) {
    throw new Error("tags must contain 1 to 6 non-empty strings");
  }
  if (!covers.includes(data.cover)) throw new Error("Unknown article cover");
  const publishedAt = dateField(data, "publishedAt");
  const updatedAt =
    data.updatedAt === undefined ? publishedAt : dateField(data, "updatedAt");
  if (updatedAt < publishedAt)
    throw new Error("updatedAt must not precede publishedAt");
  const tree = parser.parse(content) as Root;
  const slugger = new GithubSlugger();
  const headings: Heading[] = [];
  function walk(node: Root | RootContent) {
    if (node.type === "heading") {
      if (node.depth === 1)
        throw new Error(
          "Use level 2 or deeper headings; the page provides the article title",
        );
      const text = toString(node);
      const id = slugger.slug(text);
      if (node.depth <= 3) headings.push({ id, text, depth: node.depth });
    }
    if ("children" in node)
      node.children.forEach((child) => walk(child as RootContent));
  }
  walk(tree);
  const text = plainText(tree).replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Article body must not be empty");
  const chinese = text.match(/[\p{Script=Han}]/gu)?.length ?? 0;
  const words = text.match(/[a-zA-Z0-9]+/g)?.length ?? 0;
  return {
    id,
    slug,
    filename,
    title: field(data, "title", 120),
    description: field(data, "description", 240),
    publishedAt,
    updatedAt,
    topic: topic as TopicSlug,
    tags: [...new Set(data.tags.map((tag: string) => tag.trim()))],
    cover: data.cover,
    featured: data.featured ?? false,
    draft: data.draft,
    readingMinutes: Math.max(1, Math.ceil(chinese / 350 + words / 200)),
    headings,
    text,
  };
}

export async function collectArticles(
  directory: string,
  now = new Date(),
): Promise<SourceArticle[]> {
  const filenames = (await readdir(directory))
    .filter((name) => name.endsWith(".mdx"))
    .sort();
  const all: SourceArticle[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const filename of filenames) {
    if (!/^[a-z0-9-]+\.mdx$/.test(filename))
      throw new Error(`Invalid article filename: ${filename}`);
    let article: SourceArticle;
    try {
      article = parseArticle(
        await readFile(path.join(directory, filename), "utf8"),
        filename,
      );
    } catch (error) {
      throw new Error(
        `${filename}: ${error instanceof Error ? error.message : "Invalid article"}`,
      );
    }
    if (ids.has(article.id))
      throw new Error(`Duplicate article id: ${article.id}`);
    if (slugs.has(article.slug))
      throw new Error(`Duplicate article slug: ${article.slug}`);
    ids.add(article.id);
    slugs.add(article.slug);
    all.push(article);
  }
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return all
    .filter((article) => !article.draft && article.publishedAt <= today)
    .sort(
      (a, b) =>
        b.publishedAt.localeCompare(a.publishedAt) ||
        a.filename.localeCompare(b.filename),
    );
}
