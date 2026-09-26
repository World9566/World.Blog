"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { MouseEvent } from "react";
import { formatDate } from "@/lib/site";
import { SearchForm } from "./search-form";
import { Pagination, PAGE_SIZE, parsePage } from "./pagination";
import { Icon } from "./icon";

export interface SearchResultData {
  id: string;
  slug: string;
  title: string;
  topic: string;
  topicName: string;
  excerpt: string;
  publishedAt: string;
  readingMinutes: number;
}

export function SearchContent({
  query,
  tooLong,
  articles,
  topics,
}: {
  query: string;
  tooLong: boolean;
  articles: SearchResultData[];
  topics: { slug: string; name: string }[];
}) {
  const searchParams = useSearchParams();
  const requestedTopic = searchParams.get("topic") || "";
  const topic = topics.some((item) => item.slug === requestedTopic)
    ? requestedTopic
    : "";
  const filtered = articles.filter(
    (article) => !topic || article.topic === topic,
  );
  const page = Math.min(
    parsePage(searchParams.get("page") || undefined),
    Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
  );

  function navigateFilter(event: MouseEvent<HTMLDivElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href);
    if (
      url.origin !== window.location.origin ||
      url.pathname !== "/search" ||
      url.searchParams.get("q") !== query
    )
      return;
    event.preventDefault();
    const nextUrl = `${url.pathname}${url.search}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl)
      window.history.pushState(null, "", nextUrl);
  }

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
      <div data-instant-filters="/search" onClickCapture={navigateFilter}>
        {query && !tooLong && (
          <nav
            className="filter-row secondary-tabbar container"
            aria-label="搜索专题筛选"
          >
            <Link
              prefetch={false}
              className={`filter-chip secondary-tab${!topic ? " selected" : ""}`}
              href={`/search?${new URLSearchParams({ q: query })}`}
              aria-current={!topic ? "page" : undefined}
            >
              全部专题
            </Link>
            {topics.map((item) => (
              <Link
                key={item.slug}
                prefetch={false}
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
            <>
              <p className="result-count" role="status">
                “{query}” 的搜索结果 · {filtered.length} 篇文章
              </p>
              {filtered.length ? (
                <div className="search-results">
                  {filtered
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
                        <p>{article.excerpt}</p>
                        <div className="card-meta">
                          <time dateTime={article.publishedAt}>
                            <Icon name="calendar" width="15" height="15" />
                            {formatDate(article.publishedAt)}
                          </time>
                          <span
                            className="card-meta-divider"
                            aria-hidden="true"
                          />
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
                total={filtered.length}
                pathname="/search"
                prefetch={false}
                params={{ q: query, ...(topic ? { topic } : {}) }}
              />
            </>
          ) : (
            <div className="search-intro">
              <Icon name="book" width="28" height="28" />
              <p>一个关键词，也许就是新思路的起点。</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
