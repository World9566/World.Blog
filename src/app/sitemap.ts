import type { MetadataRoute } from "next";
import { getArticles } from "@/lib/content";
import { getSiteUrl } from "@/lib/site";
import { topicsForArticles } from "@/lib/topics";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const articles = await getArticles();
  const topics = topicsForArticles(articles);
  return [
    ...[
      "/",
      "/articles",
      "/topics",
      "/about",
      ...topics.map((topic) => `/topics/${topic.slug}`),
    ].map((pathname) => ({ url: new URL(pathname, base).href })),
    ...articles.map((article) => ({
      url: new URL(`/articles/${article.slug}`, base).href,
      lastModified: `${article.updatedAt}T00:00:00+08:00`,
    })),
  ];
}
