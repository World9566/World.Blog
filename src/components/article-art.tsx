import type { ArticleCover } from "@/lib/article-types";
import { isPresetCover } from "@/lib/article-cover";
import { CoverImage } from "./cover-image";

export function ArticleArt({
  cover,
  large = false,
}: {
  cover: ArticleCover;
  large?: boolean;
}) {
  if (!cover) return null;
  if (!isPresetCover(cover))
    return <CoverImage key={cover} src={cover} large={large} />;
  return (
    <div
      className={`article-art art-${cover}${large ? " art-large" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 480 300" fill="none">
        {cover === "layers" && (
          <g stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
            <path d="m91 190 149-75 149 75-149 75Z" className="art-face" />
            <path
              d="m91 190 149 75 149-75v14l-149 75-149-75Z"
              className="art-edge"
            />
            <path d="m91 144 149-75 149 75-149 75Z" className="art-face" />
            <path
              d="m91 144 149 75 149-75v14l-149 75-149-75Z"
              className="art-edge"
            />
            <path d="m91 98 149-75 149 75-149 75Z" className="art-face" />
            <path
              d="m91 98 149 75 149-75v14l-149 75-149-75Z"
              className="art-edge"
            />
            <path d="m159 98 81-41 81 41-81 41Z" opacity=".35" />
            <path d="m199 98 41-21 41 21-41 21Z" opacity=".5" />
            <path d="M240 279v12M389 204l13 7M78 211l13-7" opacity=".35" />
          </g>
        )}
        {cover === "branches" && (
          <g stroke="currentColor" strokeWidth="2">
            <path
              d="M113 235V60M113 187c0-76 158-4 158-87V65M271 100c0 58 95 5 95 81v54"
              strokeWidth="3"
            />
            {[
              [113, 65],
              [113, 145],
              [113, 235],
              [271, 65],
              [271, 126],
              [365, 235],
            ].map(([cx, cy]) => (
              <circle
                key={`${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r="12"
                className="art-face"
              />
            ))}
            <path
              d="M144 65h38M144 145h27M302 65h53M144 235h52M305 235h25"
              opacity=".25"
              strokeWidth="5"
            />
          </g>
        )}
        {cover === "brackets" && (
          <g stroke="currentColor" strokeWidth="1.2">
            <rect
              x="83"
              y="46"
              width="314"
              height="208"
              rx="10"
              className="art-face"
            />
            <path d="M83 79h314" opacity=".25" />
            <circle cx="100" cy="63" r="3" />
            <circle cx="112" cy="63" r="3" opacity=".5" />
            <circle cx="124" cy="63" r="3" opacity=".25" />
            <path
              d="m163 123-29 28 29 28M317 123l29 28-29 28M257 110l-33 83"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M189 220h102" opacity=".2" strokeWidth="4" />
          </g>
        )}
        {cover === "search" && (
          <g stroke="currentColor" strokeWidth="1.5">
            <rect
              x="80"
              y="67"
              width="268"
              height="164"
              rx="10"
              className="art-face"
            />
            <path
              d="M109 102h192M109 128h140M109 154h168M109 180h98M109 206h153"
              opacity=".3"
              strokeWidth="4"
            />
            <circle cx="301" cy="144" r="54" className="art-face" />
            <path d="m340 183 50 50" strokeWidth="13" strokeLinecap="round" />
            <circle cx="301" cy="144" r="40" opacity=".35" />
            <path d="M277 144h48M301 120v48" opacity=".4" />
          </g>
        )}
      </svg>
    </div>
  );
}
