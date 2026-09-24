export function HeroArtwork({ layers = true }: { layers?: boolean }) {
  return (
    <div className="hero-artwork" aria-hidden="true">
      <svg viewBox="0 0 1440 360" fill="none" focusable="false">
        <g stroke="var(--hero-line)" strokeWidth="0.8">
          <path d="M-90 272C132 278 304 199 306-48" />
          <path d="M88-44C286 57 352 211 313 400" />
          <path d="M339-34C361 171 288 272 169 354" />
          <path d="M955 360 1445 45" strokeDasharray="3 4" />
          <path d="M1083 360 1450 128" strokeDasharray="3 4" />
        </g>
        <circle cx="270" cy="158" r="4.5" fill="var(--primary)" />
        <circle cx="1108" cy="170" r="4.5" fill="var(--primary)" />
        {layers && (
          <g
            stroke="var(--hero-stack-stroke)"
            strokeWidth="0.9"
            strokeLinejoin="round"
          >
            <path
              d="m1140 225 110-57 110 57-110 58-110-58Z"
              fill="var(--hero-face)"
            />
            <path
              d="m1140 225 110 58 110-58v11l-110 58-110-58v-11Z"
              fill="var(--hero-edge)"
            />
            <path
              d="m1140 187 110-57 110 57-110 58-110-58Z"
              fill="var(--hero-face)"
            />
            <path
              d="m1140 187 110 58 110-58v11l-110 58-110-58v-11Z"
              fill="var(--hero-edge)"
            />
            <path
              d="m1140 149 110-57 110 57-110 58-110-58Z"
              fill="var(--hero-face)"
            />
            <path
              d="m1140 149 110 58 110-58v11l-110 58-110-58v-11Z"
              fill="var(--hero-edge)"
            />
            <path
              d="m1218 149 32-17 32 17-32 17-32-17Z"
              fill="var(--hero-accent)"
              stroke="none"
            />
            <circle
              cx="1250"
              cy="149"
              r="2.5"
              fill="var(--primary)"
              stroke="none"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
