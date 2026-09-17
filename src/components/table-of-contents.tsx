"use client";

import { useEffect, useState } from "react";
import type { Heading } from "@/lib/article-types";

export function TableOfContents({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState("");
  useEffect(() => {
    let frame = 0;
    function update() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let current = headings[0]?.id || "";
        for (const heading of headings) {
          const element = document.getElementById(heading.id);
          if (element && element.getBoundingClientRect().top <= 150)
            current = heading.id;
        }
        setActive(current);
      });
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      cancelAnimationFrame(frame);
    };
  }, [headings]);
  if (!headings.length) return null;
  const links = (
    <ol>
      {headings.map((heading) => (
        <li
          key={heading.id}
          className={heading.depth === 3 ? "toc-nested" : undefined}
        >
          <a
            href={`#${heading.id}`}
            aria-current={active === heading.id ? "location" : undefined}
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      <nav className="desktop-toc" aria-label="文章目录">
        <p>本篇目录</p>
        {links}
      </nav>
      <details className="mobile-toc">
        <summary>本篇目录</summary>
        <nav aria-label="文章目录">{links}</nav>
      </details>
    </>
  );
}
