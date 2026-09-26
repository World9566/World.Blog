export function SearchResultsSkeleton() {
  return (
    <div className="search-results-skeleton" role="status">
      <span className="sr-only">正在寻找相关内容</span>
      <div aria-hidden="true">
        <div className="result-count">
          <div className="skeleton-line search-skeleton-count" />
        </div>
        {[0, 1, 2].map((row) => (
          <div className="search-result search-skeleton-card" key={row}>
            <div className="skeleton-line search-skeleton-category" />
            <div className="skeleton-line search-skeleton-title" />
            <div className="search-skeleton-copy">
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </div>
            <div className="skeleton-line search-skeleton-meta" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SearchPageSkeleton() {
  return (
    <main id="main-content" className="search-page search-page-skeleton">
      <section className="page-heading container" aria-hidden="true">
        <p className="eyebrow">带着问题来</p>
        <h1>找一点启发。</h1>
        <div className="search-form search-skeleton-form">
          <span className="skeleton-line search-skeleton-input" />
          <span className="skeleton-line search-skeleton-button" />
        </div>
      </section>
      <div className="container search-skeleton-filters" aria-hidden="true">
        {[0, 1, 2, 3].map((item) => (
          <span className="skeleton-line" key={item} />
        ))}
      </div>
      <section className="search-content container">
        <SearchResultsSkeleton />
      </section>
    </main>
  );
}
