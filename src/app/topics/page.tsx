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
    <main id="main-content">
      <section className="page-heading container">
        <HeroArtwork />
        <p className="eyebrow">沿着一条线，读深一点</p>
        <h1>循着兴趣，探索。</h1>
        <p>把相关的问题，放在一起思考。</p>
      </section>
      <section className="section section-parchment">
        <div className="container topic-directory">
          {topics.map((topic) => (
            <Link
              href={`/topics/${topic.slug}`}
              className="topic-directory-row"
              key={topic.slug}
            >
              <TopicArtwork slug={topic.slug} />
              <div>
                <h2>{topic.name}</h2>
                {topic.description && <p>{topic.description}</p>}
              </div>
              <span className="topic-count">{topic.count} 篇文章</span>
              <Icon name="arrow" />
            </Link>
          ))}
          {!topics.length && <p className="empty-note">新的文章，正在路上。</p>}
        </div>
      </section>
    </main>
  );
}
