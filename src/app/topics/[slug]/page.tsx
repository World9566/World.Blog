import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticles } from "@/lib/content";
import { topicsForArticles } from "@/lib/topics";
import { ArticleCard } from "@/components/article-card";

export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const slug = (await params).slug;
  const topic = topicsForArticles(await getArticles()).find(
    (item) => item.slug === slug,
  );
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
  const slug = (await params).slug;
  const all = await getArticles();
  const topic = topicsForArticles(all).find((item) => item.slug === slug);
  if (!topic) notFound();
  const articles = all.filter((article) => article.topic === topic.slug);
  return (
    <main id="main-content">
      <section className="page-heading container">
        <Link className="eyebrow" href="/topics">
          全部专题
        </Link>
        <h1>{topic.name}</h1>
        {topic.description && <p>{topic.description}</p>}
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
