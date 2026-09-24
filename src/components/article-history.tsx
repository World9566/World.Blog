import type { ArticleRevision } from "@/lib/article-history";
import { Icon } from "./icon";

const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function ArticleHistory({
  entries,
  truncated,
}: {
  entries: ArticleRevision[];
  truncated: boolean;
}) {
  if (!entries.length) return null;
  return (
    <details className="article-history" id="version-history">
      <summary>
        <span className="history-heading">
          <Icon name="history" />
          版本历史
        </span>
        <span className="history-count">{entries.length} 条记录</span>
        <Icon
          name="chevron"
          className="history-chevron"
          width="16"
          height="16"
        />
      </summary>
      <ol className="history-list" aria-label="文章版本记录">
        {entries.map((entry, index) => (
          <li key={entry.revision}>
            <div className="history-meta">
              <time dateTime={entry.committedAt}>
                {dateFormat.format(new Date(entry.committedAt))}
              </time>
              {index === 0 && <span className="history-latest">最新记录</span>}
            </div>
            <p className="history-message">{entry.summary || "更新文章"}</p>
            <span className="history-version" title={entry.revision}>
              版本 <code>{entry.revision.slice(0, 8)}</code>
            </span>
          </li>
        ))}
      </ol>
      {truncated && <p className="history-note">仅显示最近的版本记录。</p>}
    </details>
  );
}
