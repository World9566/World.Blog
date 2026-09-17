import "server-only";
import data from "@/generated/articles.json";
import { articleLoaders } from "@/generated/article-loaders";
import type { Article } from "./article-types";

export const articles: Article[] = data as Article[];
export const findArticle = (slug: string) =>
  articles.find((article) => article.slug === slug);
export const articlesInTopic = (topic: string) =>
  articles.filter((article) => article.topic === topic);
export const loadArticle = (slug: string) =>
  articleLoaders[slug as keyof typeof articleLoaders]?.();
