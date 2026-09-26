"use client";

import { useEffect, useRef } from "react";

export function ReadingProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const article = document.querySelector(".article-prose");
    let frame = 0;
    function update() {
      frame = 0;
      if (!article || !bar.current) return;
      const rect = article.getBoundingClientRect();
      const progress = Math.min(
        1,
        Math.max(
          0,
          (120 - rect.top) /
            Math.max(1, rect.height - window.innerHeight + 120),
        ),
      );
      bar.current.style.transform = `scaleX(${progress})`;
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    update();
    const observer = new ResizeObserver(schedule);
    if (article) observer.observe(article);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div className="reading-progress" aria-hidden="true">
      <div ref={bar} />
    </div>
  );
}
