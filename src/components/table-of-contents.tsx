"use client";

import { useEffect, useRef, useState } from "react";
import type { Heading } from "@/lib/article-types";

export function TableOfContents({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState("");
  const desktopList = useRef<HTMLOListElement>(null);
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
  useEffect(() => {
    const list = desktopList.current;
    if (!list) return;
    function positionIndicator() {
      const link = list?.querySelector<HTMLAnchorElement>(
        'a[aria-current="location"]',
      );
      if (!link) return;
      list?.style.setProperty("--toc-indicator-top", `${link.offsetTop}px`);
      list?.style.setProperty(
        "--toc-indicator-height",
        `${link.offsetHeight}px`,
      );
      list?.style.setProperty("--toc-indicator-opacity", "1");
    }
    positionIndicator();
    window.addEventListener("resize", positionIndicator);
    return () => window.removeEventListener("resize", positionIndicator);
  }, [active]);
  if (!headings.length) return null;
  const links = headings.map((heading) => (
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
  ));
  return (
    <>
      <nav className="desktop-toc" aria-label="文章目录">
        <p>本篇目录</p>
        <ol ref={desktopList}>{links}</ol>
      </nav>
      <details className="mobile-toc">
        <summary>本篇目录</summary>
        <nav aria-label="文章目录">
          <ol>{links}</ol>
        </nav>
      </details>
    </>
  );
}
