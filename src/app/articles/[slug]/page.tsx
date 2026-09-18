import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticles, findArticle, getArticleComponent } from "@/lib/content";
import { mdxComponentMap } from "@/mdx-components";
import { formatDate, getSiteUrl, getTopic, site } from "@/lib/site";
import { CopyButton } from "@/components/copy-button";
import { TableOfContents } from "@/components/table-of-contents";
import { ReadingProgress } from "@/components/reading-progress";
import { ArticleCard } from "@/components/article-card";
import { Icon } from "@/components/icon";
import { ArticleCommunity } from "@/components/article-community";

export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const article = await findArticle((await params).slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.description,
    alternates: { canonical: `/articles/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.description,
      url: `/articles/${article.slug}`,
      authors: [site.github],
      publishedTime: `${article.publishedAt}T00:00:00+08:00`,
      modifiedTime: `${article.updatedAt}T00:00:00+08:00`,
      tags: article.tags,
    },
  };
}
export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const article = await findArticle((await params).slug);
  if (!article) notFound();
  const Content = await getArticleComponent(article.slug);
  if (!Content) notFound();
  const articles = await getArticles();
  const related = articles
    .filter((item) => item.id !== article.id)
    .sort(
      (a, b) =>
        Number(b.topic === article.topic) - Number(a.topic === article.topic),
    )
    .slice(0, 2);
  const structured = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.description,
    datePublished: `${article.publishedAt}T00:00:00+08:00`,
    dateModified: `${article.updatedAt}T00:00:00+08:00`,
    author: { "@type": "Person", name: site.author, url: site.github },
    mainEntityOfPage: new URL(`/articles/${article.slug}`, getSiteUrl()).href,
  };
  return (
    <main id="main-content">
      <ReadingProgress />
      <div className="article-subnav">
        <div className="container">
          <Link href="/articles">
            <Icon
              name="chevron"
              className="back-chevron"
              width="14"
              height="14"
            />{" "}
            全部文章
          </Link>
          <Link href={`/topics/${article.topic}`}>
            {getTopic(article.topic)?.name}
          </Link>
        </div>
      </div>
      <header className="article-heading">
        <Link href={`/topics/${article.topic}`} className="category-link">
          {getTopic(article.topic)?.name}
        </Link>
        <h1>{article.title}</h1>
        <p className="article-description">{article.description}</p>
        <div className="article-byline">
          <a
            href={site.github}
            target="_blank"
            rel="noopener noreferrer"
            className="author-link"
          >
            <span className="author-avatar">w</span>
            {site.author}
          </a>
          <span className="byline-divider" />
          <time dateTime={article.publishedAt}>
            {formatDate(article.publishedAt)}
          </time>
          <span>{article.readingMinutes} 分钟阅读</span>
        </div>
      </header>
      <div className="article-layout container">
        <aside className="toc-column">
          <TableOfContents headings={article.headings} />
        </aside>
        <article className="article-prose">
          <Content components={mdxComponentMap} />
          <div className="article-ending">
            <div className="article-tags">
              {article.tags.map((tag) => (
                <Link
                  href={`/articles?tag=${encodeURIComponent(tag)}`}
                  key={tag}
                >
                  #{tag}
                </Link>
              ))}
            </div>
            <CopyButton share />
            {article.updatedAt !== article.publishedAt && (
              <p className="updated-at">
                更新于 {formatDate(article.updatedAt)}
              </p>
            )}
          </div>
        </article>
      </div>
      <ArticleCommunity articleId={article.id} slug={article.slug} />
      {related.length > 0 && (
        <section className="section section-parchment">
          <div className="container related-container">
            <div className="section-heading">
              <h2>接着读一篇。</h2>
              <Link href="/articles" className="text-link">
                全部文章 <Icon name="chevron" width="16" height="16" />
              </Link>
            </div>
            <div className="article-grid related-grid">
              {related.map((item) => (
                <ArticleCard article={item} key={item.id} />
              ))}
            </div>
          </div>
        </section>
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structured).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
