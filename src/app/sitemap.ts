import type { MetadataRoute } from "next";
import { articles } from "@/lib/content";
import { getSiteUrl, topics } from "@/lib/site";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
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
