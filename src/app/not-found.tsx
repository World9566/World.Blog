import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="container not-found">
      <p className="eyebrow">404</p>
      <h1>这一页，暂时找不到。</h1>
      <p>链接可能已变更，也可以试试搜索。</p>
      <div className="hero-actions">
        <Link href="/articles" className="button button-primary">
          浏览文章
        </Link>
        <Link href="/search" className="button button-secondary">
          搜索内容
        </Link>
      </div>
    </main>
  );
}
