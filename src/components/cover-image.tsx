"use client";

import { useEffect, useRef, useState } from "react";

export function CoverImage({ src, large }: { src: string; large: boolean }) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) return null;
  return (
    <div
      className={`article-art art-image${large ? " art-large" : ""}`}
      aria-hidden="true"
    >
      <img
        ref={imageRef}
        src={src}
        alt=""
        width={960}
        height={600}
        loading={large ? "eager" : "lazy"}
        fetchPriority={large ? "high" : "auto"}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
