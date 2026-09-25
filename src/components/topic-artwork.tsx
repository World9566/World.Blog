export function TopicArtwork({ slug }: { slug: string }) {
  const kind =
    slug === "fundamentals"
      ? "cube"
      : slug === "engineering"
        ? "layers"
        : slug === "web"
          ? "code"
          : "cube";

  return (
    <span className={`topic-artwork topic-artwork-${kind}`} aria-hidden="true">
      <svg viewBox="0 0 80 80" focusable="false">
        {kind === "cube" && (
          <g strokeWidth="1.6" strokeLinejoin="round">
            <path d="m40 10 26 15v30L40 70 14 55V25L40 10Z" />
            <path d="m14 25 26 15 26-15M40 40v30" />
            <path d="m40 10 26 15-26 15" className="topic-artwork-accent" />
          </g>
        )}
        {kind === "layers" && (
          <g strokeWidth="1.6" strokeLinejoin="round">
            <path d="m9 28 31-17 31 17-31 17L9 28Z" />
            <path d="m12 40 28 16 28-16M12 51l28 16 28-16" />
            <path
              d="m27 28 13-7 13 7-13 7-13-7Z"
              className="topic-artwork-accent"
            />
          </g>
        )}
        {kind === "code" && (
          <g strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="13" width="64" height="54" rx="5" />
            <path d="M8 25h64M15 19h2M22 19h2M29 19h2" />
            <path
              d="m30 37-9 8 9 8m20-16 9 8-9 8"
              className="topic-artwork-accent"
            />
            <path d="m45 33-10 24" />
          </g>
        )}
      </svg>
    </span>
  );
}
