import Link from "next/link";
import type { Article } from "@/lib/article-types";
import { getTopic, formatDate } from "@/lib/site";
import { ArticleArt } from "./article-art";
import { Icon } from "./icon";

export function ArticleCard({ article }: { article: Article }) {
  return (
    <article className="article-card">
      <Link
        className="card-art-link"
        href={`/articles/${article.slug}`}
        tabIndex={-1}
        aria-hidden="true"
      >
        <ArticleArt cover={article.cover} />
      </Link>
      <div className="card-body">
        <Link className="category-link" href={`/topics/${article.topic}`}>
          {getTopic(article.topic)?.name}
        </Link>
        <h3>
          <Link href={`/articles/${article.slug}`}>{article.title}</Link>
        </h3>
        <p>{article.description}</p>
        <div className="card-meta">
          <time dateTime={article.publishedAt}>
            {formatDate(article.publishedAt)}
          </time>
          <span>{article.readingMinutes} 分钟阅读</span>
        </div>
        <Link
          className="card-read"
          href={`/articles/${article.slug}`}
          aria-label={`阅读：${article.title}`}
        >
          阅读全文 <Icon name="arrow" width="17" height="17" />
        </Link>
      </div>
    </article>
  );
}
