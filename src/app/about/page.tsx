import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import { Icon } from "@/components/icon";
import { HeroArtwork } from "@/components/hero-artwork";

export const metadata: Metadata = {
  title: "关于",
  description: `${site.author} 的技术笔记。`,
  alternates: { canonical: "/about" },
};
export default function AboutPage() {
  return (
    <main id="main-content" className="about-page">
      <section className="page-heading container about-heading">
        <HeroArtwork layers={false} />
        <div className="about-heading-copy">
          <p className="eyebrow">你好，我是 {site.author}</p>
          <h1>
            记录所学。
            <br />
            保持好奇。
          </h1>
          <p>
            这里是我的技术笔记。
            <br />
            从具体的问题出发，留下代码、方法和思考。
          </p>
          <a
            href={site.github}
            className="button button-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            在 GitHub 找到我 <Icon name="external" width="17" height="17" />
          </a>
        </div>
        <span className="about-monogram" aria-hidden="true">
          w.
        </span>
      </section>
      <section className="section section-parchment about-section">
        <div className="container about-reading">
          <h2>把理解，留在文字里。</h2>
          <p>
            工具会更新，问题也会改变。那些认真想过、动手验证过的知识，值得留下来，随时翻阅。
          </p>
          <Link href="/articles" className="text-link">
            从一篇文章开始 <Icon name="arrow" />
          </Link>
        </div>
      </section>
    </main>
  );
}
