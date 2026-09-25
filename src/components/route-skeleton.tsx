export function RouteSkeleton({
  variant = "archive",
}: {
  variant?: "archive" | "article" | "topic";
}) {
  return (
    <main
      id="main-content"
      className={`route-skeleton route-skeleton-${variant}`}
      role="status"
    >
      <span className="sr-only">正在加载页面</span>
      <div className="container" aria-hidden="true">
        <div className="route-skeleton-heading">
          <div className="skeleton-line skeleton-kicker" />
          <div className="skeleton-line skeleton-title" />
          <div className="skeleton-line skeleton-subtitle" />
        </div>
        <div className="skeleton-line skeleton-tabs" />
        <div className="route-skeleton-grid">
          <div className="route-skeleton-card">
            <div className="skeleton-image" />
            <div className="route-skeleton-copy">
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
              <div className="skeleton-line" />
            </div>
          </div>
          {variant !== "article" && (
            <div className="route-skeleton-card">
              <div className="skeleton-image" />
              <div className="route-skeleton-copy">
                <div className="skeleton-line" />
                <div className="skeleton-line short" />
                <div className="skeleton-line" />
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
