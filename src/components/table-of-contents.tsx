"use client";

import { useEffect, useRef, useState } from "react";
import type { Heading } from "@/lib/article-types";

export function TableOfContents({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState("");
  const desktopList = useRef<HTMLOListElement>(null);
  useEffect(() => {
    let frame = 0;
    const elements = headings.flatMap((heading) => {
      const element = document.getElementById(heading.id);
      return element ? [{ id: heading.id, element }] : [];
    });
    let positions: { id: string; top: number }[] = [];
    let dirty = true;
    function update() {
      frame = 0;
      const scroll = window.scrollY;
      // Measure only after layout changes, not once per heading per scroll.
      if (dirty) {
        positions = elements.map(({ id, element }) => ({
          id,
          top: element.getBoundingClientRect().top + scroll,
        }));
        dirty = false;
      }
      let low = 0,
        high = positions.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (positions[middle].top <= scroll + 150) low = middle + 1;
        else high = middle;
      }
      setActive(positions[Math.max(0, low - 1)]?.id || "");
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    function measure() {
      dirty = true;
      schedule();
    }
    update();
    const observer = new ResizeObserver(measure);
    const main = document.getElementById("main-content");
    const article = document.querySelector(".article-prose");
    if (main) observer.observe(main);
    if (article) observer.observe(article);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    // Images and expandable MDX can move headings without a viewport resize.
    main?.addEventListener("load", measure, true);
    main?.addEventListener("toggle", measure, true);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      main?.removeEventListener("load", measure, true);
      main?.removeEventListener("toggle", measure, true);
      observer.disconnect();
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
