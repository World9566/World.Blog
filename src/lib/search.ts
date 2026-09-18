import "server-only";
import { getArticles } from "./content";
import type { Article } from "./article-types";

export function excerpt(article: Article, query: string) {
  const term = query.toLocaleLowerCase().split(/\s+/).find(Boolean) || "";
  const position = article.text.toLocaleLowerCase().indexOf(term);
  const start = Math.max(0, position - 36);
  return `${start > 0 ? "…" : ""}${article.text.slice(start, start + 150)}${article.text.length > start + 150 ? "…" : ""}`;
}

function localSearch(articles: Article[], query: string, topic?: string) {
  const terms = query
    .normalize("NFKC")
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return articles
    .filter((article) => !topic || article.topic === topic)
    .map((article) => {
      const title = article.title.normalize("NFKC").toLocaleLowerCase();
      const rest =
        `${article.description} ${article.tags.join(" ")} ${article.text}`
          .normalize("NFKC")
          .toLocaleLowerCase();
      return {
        article,
        score: terms.every(
          (term) => title.includes(term) || rest.includes(term),
        )
          ? terms.reduce(
              (score, term) => score + (title.includes(term) ? 10 : 1),
              0,
            )
          : 0,
      };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ article }) => article);
}

export async function searchArticles(
  query: string,
  topic?: string,
): Promise<{ articles: Article[]; source: "meilisearch" | "local" }> {
  if (!query.trim()) return { articles: [], source: "local" };
  const articles = await getArticles();
  try {
    if (!process.env.MEILI_HOST || !process.env.MEILI_MASTER_KEY)
      throw new Error("Search unavailable");
    const response = await fetch(
      new URL("/indexes/blog_articles/search", process.env.MEILI_HOST),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.MEILI_MASTER_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: query,
          limit: Math.max(20, articles.length),
          ...(topic ? { filter: `topic = ${JSON.stringify(topic)}` } : {}),
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(2500),
      },
    );
    if (!response.ok) throw new Error("Search unavailable");
    const result = (await response.json()) as { hits: { id: string }[] };
    const published = new Map(articles.map((article) => [article.id, article]));
    return {
      articles: result.hits
        .map(({ id }) => published.get(id))
        .filter(
          (article): article is Article =>
            !!article && (!topic || article.topic === topic),
        ),
      source: "meilisearch",
    };
  } catch {
    return { articles: localSearch(articles, query, topic), source: "local" };
  }
}
