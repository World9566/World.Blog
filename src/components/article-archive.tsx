"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { MouseEvent } from "react";
import { ArticleCard, type ArticleCardData } from "./article-card";
import { Pagination, PAGE_SIZE, parsePage } from "./pagination";

interface ArchiveTopic {
  slug: string;
  name: string;
}

export function ArticleArchive({
  articles,
  topics,
}: {
  articles: ArticleCardData[];
  topics: ArchiveTopic[];
}) {
  const searchParams = useSearchParams();
  const requestedTopic = searchParams.get("topic") || "";
  const topic = topics.some((item) => item.slug === requestedTopic)
    ? requestedTopic
    : "";
  const tag = (searchParams.get("tag") || "").slice(0, 30);
  const filtered = articles.filter(
    (article) =>
      (!topic || article.topic === topic) &&
      (!tag || article.tags.includes(tag)),
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
    if (url.origin !== window.location.origin || url.pathname !== "/articles")
      return;
    event.preventDefault();
    const nextUrl = `${url.pathname}${url.search}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl)
      window.history.pushState(null, "", nextUrl);
  }

  return (
    <div
      className="container"
      data-instant-filters
      onClickCapture={navigateFilter}
    >
      <nav className="filter-row secondary-tabbar" aria-label="文章专题筛选">
        <Link
          href="/articles"
          prefetch={false}
          className={`filter-chip secondary-tab${!topic && !tag ? " selected" : ""}`}
          aria-current={!topic && !tag ? "page" : undefined}
        >
          全部 <span>{articles.length}</span>
        </Link>
        {topics.map((item) => (
          <Link
            href={`/articles?topic=${item.slug}`}
            prefetch={false}
            key={item.slug}
            className={`filter-chip secondary-tab${topic === item.slug ? " selected" : ""}`}
            aria-current={topic === item.slug ? "page" : undefined}
          >
            {item.name}
          </Link>
        ))}
      </nav>
      {tag && (
        <div className="filter-summary">
          <span>标签：{tag}</span>
          <Link href="/articles" prefetch={false}>
            清除筛选
          </Link>
        </div>
      )}
      {filtered.length ? (
        <div className="archive-list" key={`${topic}:${tag}:${page}`}>
          {filtered
            .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
            .map((article) => (
              <ArticleCard article={article} archive key={article.id} />
            ))}
        </div>
      ) : (
        <div className="empty-state" key={`${topic}:${tag}`}>
          <h2>这里还没有文章。</h2>
          <p>换个专题，看看其他值得读的内容。</p>
          <Link
            href="/articles"
            prefetch={false}
            className="button button-primary"
          >
            查看全部文章
          </Link>
        </div>
      )}
      <Pagination
        pathname="/articles"
        prefetch={false}
        page={page}
        total={filtered.length}
        params={{ ...(topic ? { topic } : {}), ...(tag ? { tag } : {}) }}
      />
    </div>
  );
}
