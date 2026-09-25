import type { Metadata } from "next";
import { getArticles } from "@/lib/content";
import { topicsForArticles } from "@/lib/topics";
import { ArticleArchive } from "@/components/article-archive";
import { HeroArtwork } from "@/components/hero-artwork";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "全部文章",
  description: "浏览技术笔记，按专题或标签找到感兴趣的文章。",
  alternates: { canonical: "/articles" },
};
export default async function ArticlesPage() {
  const articles = await getArticles();
  const topics = topicsForArticles(articles);
  const previews = articles.map((article) => ({
    id: article.id,
    slug: article.slug,
    cover: article.cover,
    topic: article.topic,
    topicName: article.topicName,
    tags: article.tags,
    title: article.title,
    description: article.description,
    preview: article.preview,
    publishedAt: article.publishedAt,
    readingMinutes: article.readingMinutes,
  }));
  return (
    <main id="main-content" className="archive-page">
      <section className="page-heading container">
        <HeroArtwork layers={false} />
        <p className="eyebrow">慢慢积累，常常回看</p>
        <h1>全部文章。</h1>
        <p>关于工具、代码，以及背后的原理。</p>
      </section>
      <section className="section-parchment archive-content">
        <ArticleArchive articles={previews} topics={topics} />
      </section>
    </main>
  );
}
