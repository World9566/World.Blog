export function AdminListSkeleton({
  section,
}: {
  section: "comments" | "users" | "audit";
}) {
  return (
    <div className="admin-list-skeleton" role="status">
      <span className="sr-only">正在加载列表</span>
      <div aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <div className="admin-skeleton-row" key={row}>
            <div className="admin-row-top">
              <div className="admin-person">
                {section !== "audit" && (
                  <span className="skeleton-line admin-skeleton-avatar" />
                )}
                <span className="skeleton-line admin-skeleton-name" />
              </div>
              <span className="skeleton-line admin-skeleton-badge" />
            </div>
            <div className="skeleton-line admin-skeleton-meta" />
            <div className="skeleton-line admin-skeleton-body" />
            {section === "comments" && (
              <div className="skeleton-line admin-skeleton-detail" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
