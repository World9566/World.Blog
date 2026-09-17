import Link from "next/link";
import { site } from "@/lib/site";
import { Icon } from "./icon";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-main">
          <div>
            <Link href="/" className="footer-wordmark">
              {site.name}.
            </Link>
            <p>记录所学，保持好奇。</p>
          </div>
          <nav aria-label="页脚导航">
            <Link href="/articles">全部文章</Link>
            <Link href="/topics">浏览专题</Link>
            <Link href="/feed.xml">RSS 订阅</Link>
            <a href={site.github} target="_blank" rel="noopener noreferrer">
              GitHub <Icon name="external" width="14" height="14" />
            </a>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {site.author}
          </span>
          <span>Stay curious.</span>
        </div>
      </div>
    </footer>
  );
}
