export type ArticleCover = string | null;
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
  preview?: string;
  publishedAt: string;
  updatedAt: string;
  topic: string;
  topicName: string;
  topicDescription: string;
  topicCover: string | null;
  tags: string[];
  cover: ArticleCover;
  featured: boolean;
  readingMinutes: number;
  headings: Heading[];
  text: string;
}
