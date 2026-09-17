import type { Metadata } from "next";
import Link from "next/link";
import { articles } from "@/lib/content";
import { topics } from "@/lib/site";
import { Icon } from "@/components/icon";

export const metadata: Metadata = {
  title: "专题",
  description: "沿着工程实践、Web 开发和计算机基础，发现感兴趣的文章。",
  alternates: { canonical: "/topics" },
};
export default function TopicsPage() {
  return (
    <main id="main-content">
      <section className="page-heading container">
        <p className="eyebrow">沿着一条线，读深一点</p>
        <h1>循着兴趣，探索。</h1>
        <p>把相关的问题，放在一起思考。</p>
      </section>
      <section className="section section-parchment">
        <div className="container topic-directory">
          {topics.map((topic) => (
            <Link
              href={`/topics/${topic.slug}`}
              className="topic-directory-row"
              key={topic.slug}
            >
              <span className="topic-number">{topic.symbol}</span>
              <div>
                <h2>{topic.name}</h2>
                <p>{topic.description}</p>
              </div>
              <span className="topic-count">
                {
                  articles.filter((article) => article.topic === topic.slug)
                    .length
                }{" "}
                篇文章
              </span>
              <Icon name="arrow" />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
