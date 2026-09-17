import "server-only";
import data from "@/generated/articles.json";
import type { Article } from "./article-types";

// Keep API routes independent of the MDX loader used by article pages.
export const publishedArticles: Article[] = data as Article[];
export const publishedArticle = (id: string) =>
  publishedArticles.find((article) => article.id === id);
