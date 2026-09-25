"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function TopicCoverImage({
  src,
  fallback,
}: {
  src: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A server-rendered image may fail before React attaches onError.
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) return fallback;
  return (
    <span className="topic-artwork topic-artwork-image" aria-hidden="true">
      <img
        ref={imageRef}
        src={src}
        alt=""
        width={80}
        height={80}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
