import Link from "next/link";
import { getArticles } from "@/lib/content";
import { topicsForArticles } from "@/lib/topics";
import { ArticleArt } from "@/components/article-art";
import { ArticleCard } from "@/components/article-card";
import { Icon } from "@/components/icon";
import { HeroArtwork } from "@/components/hero-artwork";
import { TopicArtwork } from "@/components/topic-artwork";
import { formatDate } from "@/lib/site";

export const dynamic = "force-dynamic";
export default async function Home() {
  const articles = await getArticles();
  const topics = topicsForArticles(articles);
  const featured = articles.find((article) => article.featured) || articles[0];
  const latest = articles
    .filter((article) => article.id !== featured?.id)
    .slice(0, 3);
  return (
    <main id="main-content">
      <section className="home-hero container">
        <HeroArtwork />
        <p className="eyebrow">技术笔记</p>
        <h1>
          技术，值得
          <br className="phone-only" />
          深入一点。
        </h1>
        <p className="hero-description">
          从代码到原理，
          <br className="phone-only" />
          把每一个问题想明白。
        </p>
        <div className="hero-actions">
          <Link href="/articles" className="button button-primary">
            开始阅读
          </Link>
          <Link href="/topics" className="text-link">
            浏览专题 <Icon name="chevron" width="16" height="16" />
          </Link>
        </div>
      </section>
      {featured && (
        <section className="featured-section">
          <div
            className={`container featured-grid${featured.cover ? "" : " featured-text-only"}`}
          >
            <div className="featured-copy">
              <p className="eyebrow">
                精选 ·{" "}
                <Link href={`/topics/${featured.topic}`}>
                  {featured.topicName}
                </Link>
              </p>
              <h2>
                <Link href={`/articles/${featured.slug}`}>
                  {featured.title}
                </Link>
              </h2>
              <p>{featured.description}</p>
              <div className="featured-meta">
                <time dateTime={featured.publishedAt}>
                  <Icon name="calendar" width="17" height="17" />
                  {formatDate(featured.publishedAt)}
                </time>
                <span className="featured-meta-divider" aria-hidden="true" />
                <span className="featured-meta-duration">
                  <Icon name="clock" width="17" height="17" />
                  {featured.readingMinutes} 分钟阅读
                </span>
                <span className="featured-meta-divider" aria-hidden="true" />
                <Link
                  href={`/articles/${featured.slug}`}
                  className="featured-meta-link"
                >
                  阅读文章 <Icon name="arrow" width="17" height="17" />
                </Link>
              </div>
            </div>
            {featured.cover && (
              <Link
                href={`/articles/${featured.slug}`}
                className="featured-art-link"
                aria-label={`阅读：${featured.title}`}
                tabIndex={-1}
              >
                <ArticleArt cover={featured.cover} large />
              </Link>
            )}
          </div>
        </section>
      )}
      <section
        className="section section-parchment home-recent-section"
        id="articles"
      >
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">继续探索</p>
              <h2>最近的文章。</h2>
            </div>
            <Link href="/articles" className="text-link">
              查看全部 <Icon name="chevron" width="16" height="16" />
            </Link>
          </div>
          {latest.length ? (
            <div className={`home-bento home-bento-${latest.length}`}>
              {latest.map((article, index) =>
                index === 0 ? (
                  <div
                    className={`home-bento-lead${article.cover ? "" : " home-bento-lead-text-only"}`}
                    key={article.id}
                  >
                    <ArticleCard article={article} />
                  </div>
                ) : (
                  <article className="home-bento-compact" key={article.id}>
                    <Link
                      href={`/articles/${article.slug}`}
                      className="home-bento-compact-link"
                    >
                      <div className="home-bento-compact-copy">
                        <h3>{article.title}</h3>
                        <time dateTime={article.publishedAt}>
                          <Icon name="calendar" width="15" height="15" />
                          {formatDate(article.publishedAt)}
                        </time>
                      </div>
                      {article.cover && (
                        <div className="home-bento-compact-art">
                          <ArticleArt cover={article.cover} />
                        </div>
                      )}
                    </Link>
                  </article>
                ),
              )}
            </div>
          ) : (
            <p className="empty-note">新的思考，正在路上。</p>
          )}
        </div>
      </section>
      {topics.length > 0 && (
        <section className="section home-topics-section">
          <div className="container">
            <div className="section-heading">
              <div>
                <p className="eyebrow">循着兴趣</p>
                <h2>找到你的下一篇。</h2>
              </div>
            </div>
            <div className="home-topic-pills">
              {topics.map((topic) => (
                <Link
                  href={`/topics/${topic.slug}`}
                  key={topic.slug}
                  className="home-topic-pill"
                  aria-label={`${topic.name}，${topic.count} 篇文章${topic.description ? `。${topic.description}` : ""}`}
                >
                  <TopicArtwork slug={topic.slug} cover={topic.cover} />
                  <span className="home-topic-pill-name">{topic.name}</span>
                  <span className="home-topic-pill-count">
                    {topic.count} 篇文章
                  </span>
                  <Icon name="arrow" width="17" height="17" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
