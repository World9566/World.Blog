import Link from "next/link";
import { getArticles } from "@/lib/content";
import { topicsForArticles } from "@/lib/topics";
import { ArticleArt } from "@/components/article-art";
import { ArticleCard } from "@/components/article-card";
import { Icon } from "@/components/icon";

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
              <p className="eyebrow">精选 · {featured.topicName}</p>
              <h2>
                <Link href={`/articles/${featured.slug}`}>
                  {featured.title}
                </Link>
              </h2>
              <p>{featured.description}</p>
              <Link href={`/articles/${featured.slug}`} className="text-link">
                阅读文章 <Icon name="arrow" />
              </Link>
              <span className="featured-time">
                {featured.readingMinutes} 分钟阅读
              </span>
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
      <section className="section section-parchment" id="articles">
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
            <div className="article-grid">
              {latest.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          ) : (
            <p className="empty-note">新的思考，正在路上。</p>
          )}
        </div>
      </section>
      {topics.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-heading">
              <div>
                <p className="eyebrow">循着兴趣</p>
                <h2>找到你的下一篇。</h2>
              </div>
            </div>
            <div className="topic-grid">
              {topics.map((topic) => (
                <Link
                  href={`/topics/${topic.slug}`}
                  key={topic.slug}
                  className="topic-card"
                >
                  <h3>{topic.name}</h3>
                  {topic.description && <p>{topic.description}</p>}
                  <span className="topic-bottom">
                    {topic.count} 篇文章 <Icon name="arrow" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
