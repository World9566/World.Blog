import type { Metadata } from "next";
import Link from "next/link";
import { getArticles } from "@/lib/content";
import { topicsForArticles } from "@/lib/topics";
import { Icon } from "@/components/icon";
import { HeroArtwork } from "@/components/hero-artwork";
import { TopicArtwork } from "@/components/topic-artwork";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "专题",
  description: "按专题浏览技术笔记，发现感兴趣的文章。",
  alternates: { canonical: "/topics" },
};
export default async function TopicsPage() {
  const articles = await getArticles();
  const topics = topicsForArticles(articles);
  return (
    <main id="main-content" className="topics-page">
      <section className="page-heading container">
        <HeroArtwork layers={false} />
        <p className="eyebrow">沿着一条线，读深一点</p>
        <h1>循着兴趣，探索。</h1>
        <p>把相关的问题，放在一起思考。</p>
      </section>
      <section className="section section-parchment topic-section">
        <div className="container topic-directory">
          {topics.map((topic) => {
            const recent = articles
              .filter((article) => article.topic === topic.slug)
              .slice(0, 2);
            return (
              <article className="topic-directory-row" key={topic.slug}>
                <div className="topic-directory-main">
                  <TopicArtwork slug={topic.slug} />
                  <div>
                    <h2>
                      <Link href={`/topics/${topic.slug}`}>{topic.name}</Link>
                    </h2>
                    {topic.description && <p>{topic.description}</p>}
                  </div>
                  <Link
                    href={`/topics/${topic.slug}`}
                    className="topic-directory-arrow"
                    aria-label={`查看${topic.name}专题`}
                  >
                    <Icon name="arrow" />
                  </Link>
                </div>
                <div className="topic-directory-details">
                  <span className="topic-count">
                    <Icon name="book" width="16" height="16" />
                    {topic.count} 篇文章
                  </span>
                  <ol
                    className="topic-recent-list"
                    aria-label={`${topic.name}最新文章`}
                  >
                    {recent.map((article) => (
                      <li key={article.id}>
                        <Link href={`/articles/${article.slug}`}>
                          <span>{article.title}</span>
                          <Icon name="chevron" width="15" height="15" />
                        </Link>
                      </li>
                    ))}
                  </ol>
                </div>
              </article>
            );
          })}
          {!topics.length && <p className="empty-note">新的文章，正在路上。</p>}
        </div>
      </section>
    </main>
  );
}
