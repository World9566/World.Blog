import type { Metadata } from "next";
import Link from "next/link";
import { getArticles } from "@/lib/content";
import { topicsForArticles } from "@/lib/topics";
import { ArticleCard } from "@/components/article-card";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/pagination";
import { HeroArtwork } from "@/components/hero-artwork";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "全部文章",
  description: "浏览技术笔记，按专题或标签找到感兴趣的文章。",
  alternates: { canonical: "/articles" },
};
export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; tag?: string; page?: string }>;
}) {
  const params = await searchParams;
  const articles = await getArticles();
  const topics = topicsForArticles(articles);
  const topic =
    typeof params.topic === "string" &&
    topics.some((item) => item.slug === params.topic)
      ? params.topic
      : "";
  const tag = typeof params.tag === "string" ? params.tag.slice(0, 30) : "";
  const filtered = articles.filter(
    (article) =>
      (!topic || article.topic === topic) &&
      (!tag || article.tags.includes(tag)),
  );
  const page = Math.min(
    parsePage(params.page),
    Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
  );
  return (
    <main id="main-content" className="archive-page">
      <section className="page-heading container">
        <HeroArtwork layers={false} />
        <p className="eyebrow">慢慢积累，常常回看</p>
        <h1>全部文章。</h1>
        <p>关于工具、代码，以及背后的原理。</p>
      </section>
      <section className="section-parchment archive-content">
        <div className="container">
          <nav className="filter-row" aria-label="文章专题筛选">
            <Link
              href="/articles"
              className={`filter-chip${!topic && !tag ? " selected" : ""}`}
              aria-current={!topic && !tag ? "page" : undefined}
            >
              全部 <span>{articles.length}</span>
            </Link>
            {topics.map((item) => (
              <Link
                href={`/articles?topic=${item.slug}`}
                key={item.slug}
                className={`filter-chip${topic === item.slug ? " selected" : ""}`}
                aria-current={topic === item.slug ? "page" : undefined}
              >
                {item.name}
              </Link>
            ))}
          </nav>
          {tag && (
            <div className="filter-summary">
              <span>标签：{tag}</span>
              <Link href="/articles">清除筛选</Link>
            </div>
          )}
          {filtered.length ? (
            <div className="article-grid">
              {filtered
                .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                .map((article) => (
                  <ArticleCard article={article} key={article.id} />
                ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>这里还没有文章。</h2>
              <p>换个专题，看看其他值得读的内容。</p>
              <Link href="/articles" className="button button-primary">
                查看全部文章
              </Link>
            </div>
          )}
          <Pagination
            pathname="/articles"
            page={page}
            total={filtered.length}
            params={{ ...(topic ? { topic } : {}), ...(tag ? { tag } : {}) }}
          />
        </div>
      </section>
    </main>
  );
}
