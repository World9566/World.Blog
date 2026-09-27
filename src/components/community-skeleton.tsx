export function ActivitySkeleton({ kind }: { kind: "bookmarks" | "comments" }) {
  return (
    <div className="activity-skeleton" role="status">
      <span className="sr-only">
        {kind === "bookmarks" ? "正在加载收藏" : "正在加载评论"}
      </span>
      <div aria-hidden="true">
        {[0, 1].map((row) => (
          <div className="activity-skeleton-row" key={row}>
            <div className="activity-skeleton-copy">
              <div className="skeleton-line activity-skeleton-title" />
              {kind === "comments" && (
                <div className="skeleton-line activity-skeleton-excerpt" />
              )}
              <div className="skeleton-line activity-skeleton-date" />
            </div>
            {kind === "bookmarks" && (
              <div className="skeleton-line activity-skeleton-action" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CommentSkeleton({ replies = false }: { replies?: boolean }) {
  return (
    <div className="comment-skeleton" role="status">
      <span className="sr-only">
        {replies ? "正在加载回复" : "正在加载讨论"}
      </span>
      <div aria-hidden="true">
        {[0, 1].map((row) => (
          <div className="comment-skeleton-row" key={row}>
            <div className="comment-skeleton-author">
              <span className="skeleton-line comment-skeleton-avatar" />
              <span className="skeleton-line comment-skeleton-name" />
              <span className="skeleton-line comment-skeleton-date" />
            </div>
            <div className="skeleton-line comment-skeleton-body" />
            <div className="skeleton-line comment-skeleton-detail" />
          </div>
        ))}
      </div>
    </div>
  );
}
