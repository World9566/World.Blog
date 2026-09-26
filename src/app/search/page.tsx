import type { Metadata } from "next";
import Link from "next/link";
import { searchArticles, excerpt } from "@/lib/search";
import { formatDate } from "@/lib/site";
import { getArticles } from "@/lib/content";
import { topicsForArticles } from "@/lib/topics";
import { SearchForm } from "@/components/search-form";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/pagination";
import { Icon } from "@/components/icon";
import type { Article } from "@/lib/article-types";

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
  const topics = topicsForArticles(await getArticles());
  const topic =
    typeof params.topic === "string" &&
    topics.some((item) => item.slug === params.topic)
      ? params.topic
      : "";
  const result =
    query && !tooLong ? await searchArticles(query, topic) : { articles: [] };
  return (
    <main id="main-content" className="search-page">
      <section className="page-heading container">
        <p className="eyebrow">带着问题来</p>
        <h1>找一点启发。</h1>
        <SearchForm query={query} topic={topic} />
        {!query && (
          <div className="search-suggestions">
            <span>试着搜搜</span>
            {["Docker", "Git", "缓存", "TypeScript"].map((word) => (
              <Link key={word} href={`/search?q=${encodeURIComponent(word)}`}>
                {word}
              </Link>
            ))}
          </div>
        )}
      </section>
      {query && (
        <nav
          className="filter-row secondary-tabbar container"
          aria-label="搜索专题筛选"
        >
          <Link
            className={`filter-chip secondary-tab${!topic ? " selected" : ""}`}
            href={`/search?${new URLSearchParams({ q: query })}`}
            aria-current={!topic ? "page" : undefined}
          >
            全部专题
          </Link>
          {topics.map((item) => (
            <Link
              key={item.slug}
              className={`filter-chip secondary-tab${topic === item.slug ? " selected" : ""}`}
              href={`/search?${new URLSearchParams({ q: query, topic: item.slug })}`}
              aria-current={topic === item.slug ? "page" : undefined}
            >
              {item.name}
            </Link>
          ))}
        </nav>
      )}
      <section className="search-content container">
        {tooLong ? (
          <div className="empty-state" role="status">
            <h2>关键词有点长。</h2>
            <p>请将搜索内容缩短到 120 个字符以内。</p>
          </div>
        ) : query ? (
          <SearchResults
            articles={result.articles}
            query={query}
            topic={topic}
            requestedPage={params.page}
          />
        ) : (
          <div className="search-intro">
            <Icon name="book" width="28" height="28" />
            <p>一个关键词，也许就是新思路的起点。</p>
          </div>
        )}
      </section>
    </main>
  );
}

function SearchResults({
  articles,
  query,
  topic,
  requestedPage,
}: {
  articles: Article[];
  query: string;
  topic: string;
  requestedPage?: string;
}) {
  const page = Math.min(
    parsePage(requestedPage),
    Math.max(1, Math.ceil(articles.length / PAGE_SIZE)),
  );
  return (
    <>
      <p className="result-count" role="status">
        “{query}” 的搜索结果 · {articles.length} 篇文章
      </p>
      {articles.length ? (
        <div className="search-results">
          {articles
            .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
            .map((article) => (
              <article className="search-result" key={article.id}>
                <Link
                  href={`/topics/${article.topic}`}
                  className="category-link"
                >
                  {article.topicName}
                </Link>
                <h2>
                  <Link href={`/articles/${article.slug}`}>
                    {article.title}
                    <Icon name="arrow" />
                  </Link>
                </h2>
                <p>{excerpt(article, query)}</p>
                <div className="card-meta">
                  <time dateTime={article.publishedAt}>
                    <Icon name="calendar" width="15" height="15" />
                    {formatDate(article.publishedAt)}
                  </time>
                  <span className="card-meta-divider" aria-hidden="true" />
                  <span className="card-meta-duration">
                    <Icon name="clock" width="15" height="15" />
                    {article.readingMinutes} 分钟阅读
                  </span>
                </div>
              </article>
            ))}
        </div>
      ) : (
        <div className="empty-state">
          <Icon name="search" width="36" height="36" />
          <h2>还没找到相关内容。</h2>
          <p>试试更短的关键词，或换一种表达。</p>
          <Link href="/articles" className="text-link">
            浏览全部文章 <Icon name="arrow" />
          </Link>
        </div>
      )}
      <Pagination
        page={page}
        total={articles.length}
        pathname="/search"
        params={{ q: query, ...(topic ? { topic } : {}) }}
      />
    </>
  );
}
