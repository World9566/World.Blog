import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { articlesInTopic } from "@/lib/content";
import { getTopic } from "@/lib/site";
import { ArticleCard } from "@/components/article-card";

export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const topic = getTopic((await params).slug);
  return topic
    ? {
        title: topic.name,
        description: topic.description,
        alternates: { canonical: `/topics/${topic.slug}` },
      }
    : {};
}
export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const topic = getTopic((await params).slug);
  if (!topic) notFound();
  const articles = await articlesInTopic(topic.slug);
  return (
    <main id="main-content">
      <section className="page-heading container">
        <Link className="eyebrow" href="/topics">
          全部专题 / {topic.symbol}
        </Link>
        <h1>{topic.name}。</h1>
        <p>{topic.description}</p>
        <span className="heading-count">{articles.length} 篇文章</span>
      </section>
      <section className="section section-parchment">
        <div className="container">
          {articles.length ? (
            <div className="article-grid">
              {articles.map((article) => (
                <ArticleCard article={article} key={article.id} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>新的思考，正在路上。</h2>
              <Link href="/articles" className="text-link">
                先看看其他文章
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
