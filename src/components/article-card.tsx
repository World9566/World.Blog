import Link from "next/link";
import type { Article } from "@/lib/article-types";
import { formatDate } from "@/lib/site";
import { ArticleArt } from "./article-art";
import { Icon } from "./icon";

export function ArticleCard({
  article,
  archive = false,
}: {
  article: Article;
  archive?: boolean;
}) {
  return (
    <article
      className={`article-card${article.cover ? "" : " article-card-text-only"}`}
    >
      {article.cover && (
        <Link
          className="card-art-link"
          href={`/articles/${article.slug}`}
          tabIndex={-1}
          aria-hidden="true"
        >
          <ArticleArt cover={article.cover} />
        </Link>
      )}
      <div className="card-body">
        <Link className="category-link" href={`/topics/${article.topic}`}>
          {article.topicName}
        </Link>
        {archive && article.tags.length > 0 && (
          <div className="card-tags" aria-label="文章标签">
            {article.tags.map((tag) => (
              <Link href={`/articles?tag=${encodeURIComponent(tag)}`} key={tag}>
                {tag}
              </Link>
            ))}
          </div>
        )}
        <h3>
          <Link href={`/articles/${article.slug}`}>{article.title}</Link>
        </h3>
        <p>
          {article.description}
          {archive && article.preview ? ` ${article.preview}` : ""}
        </p>
        <div className="card-meta">
          <time dateTime={article.publishedAt}>
            <Icon name="calendar" width="15" height="15" />
            {formatDate(article.publishedAt)}
          </time>
          <span className="card-meta-divider" aria-hidden="true" />
          <span className="card-meta-duration">
            <Icon name="clock" width="15" height="15" />
            {article.readingMinutes} 分钟阅读
          </span>
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
