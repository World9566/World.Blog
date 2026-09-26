import type { Metadata } from "next";
import { searchArticles, excerpt } from "@/lib/search";
import { getArticles } from "@/lib/content";
import { topicsForArticles } from "@/lib/topics";
import { SearchContent } from "@/components/search-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "搜索",
  robots: { index: false, follow: false },
};
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; topic?: string; page?: string }>;
}) {
  const params = await searchParams;
  const raw = typeof params.q === "string" ? params.q.trim() : "";
  const tooLong = raw.length > 120;
  const query = raw.slice(0, 120);
  const topics = topicsForArticles(await getArticles()).map(
    ({ slug, name }) => ({
      slug,
      name,
    }),
  );
  // Fetch matches once per keyword; topic filters and pagination run locally.
  const result =
    query && !tooLong ? await searchArticles(query) : { articles: [] };
  // Send only card data, never the full article text or MDX source.
  const articles = result.articles.map((article) => ({
    id: article.id,
    slug: article.slug,
    title: article.title,
    topic: article.topic,
    topicName: article.topicName,
    excerpt: excerpt(article, query),
    publishedAt: article.publishedAt,
    readingMinutes: article.readingMinutes,
  }));
  return (
    <SearchContent
      key={raw}
      query={query}
      tooLong={tooLong}
      topics={topics}
      articles={articles}
    />
  );
}
