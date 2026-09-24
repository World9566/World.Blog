"use client";

import { useState } from "react";

export function CoverImage({ src, large }: { src: string; large: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div
      className={`article-art art-image${large ? " art-large" : ""}`}
      aria-hidden="true"
    >
      <img
        src={src}
        alt=""
        width={960}
        height={600}
        loading={large ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
