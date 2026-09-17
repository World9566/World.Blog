"use client";

import { useEffect, useRef } from "react";

export function ReadingProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function update() {
      const article = document.querySelector(".article-prose");
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
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <div className="reading-progress" aria-hidden="true">
      <div ref={bar} />
    </div>
  );
}
