import type { TopicSlug } from "./site";

export type ArticleCover = "layers" | "branches" | "brackets" | "search";
export interface Heading {
  id: string;
  text: string;
  depth: number;
}
export interface Article {
  id: string;
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  topic: TopicSlug;
  tags: string[];
  cover: ArticleCover;
  featured: boolean;
  readingMinutes: number;
  headings: Heading[];
  text: string;
}
