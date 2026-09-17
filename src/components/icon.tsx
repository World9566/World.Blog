import type { SVGProps } from "react";

const paths = {
  heart: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
  ),
  bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
  comment: (
    <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 8.5 0 0 1 19 0Z" />
  ),
  github: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 .8a11.3 11.3 0 0 0-3.57 22.02c.56.1.77-.24.77-.54v-2.1c-3.15.68-3.82-1.34-3.82-1.34-.51-1.3-1.26-1.65-1.26-1.65-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.17 1.74 1.17 1.02 1.74 2.66 1.24 3.31.94.1-.73.4-1.24.73-1.52-2.51-.28-5.15-1.26-5.15-5.59 0-1.23.44-2.24 1.16-3.03-.12-.28-.5-1.43.11-2.99 0 0 .95-.3 3.1 1.16a10.8 10.8 0 0 1 5.65 0c2.15-1.46 3.1-1.16 3.1-1.16.61 1.56.23 2.71.11 2.99.72.79 1.16 1.8 1.16 3.03 0 4.34-2.65 5.3-5.17 5.58.41.36.77 1.04.77 2.1v3.1c0 .3.2.65.78.54A11.3 11.3 0 0 0 12 .8Z"
    />
  ),
  device: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  arrow: <path d="M4 12h15M13 6l6 6-6 6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  external: <path d="M8 5H5v14h14v-3M12 5h7v7M11 13l8-8" />,
  menu: <path d="M4 8h16M4 16h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  copy: (
    <>
      <rect x="8" y="8" width="11" height="12" rx="2" />
      <path d="M15 8V4H4v12h4" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  link: (
    <>
      <path
        d="m10 14 4-4M8 16l-1 1a4.2 4.2 0 0 1-6-6l5-5a4.2 4.2 0 0 1 6 0M16 8l1-1a4.2 4.2 0 0 1 6 6l-5 5a4.2 4.2 0 0 1-6 0"
        transform="translate(1 0) scale(.9)"
      />
    </>
  ),
  book: (
    <path d="M12 5v15M12 5C9 3 6 3 3 4v14c3-1 6-1 9 2 3-3 6-3 9-2V4c-3-1-6-1-9 1Z" />
  ),
};

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
