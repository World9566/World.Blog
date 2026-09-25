import type { ComponentProps } from "react";
import { CopyButton } from "./copy-button";

export function CodeBlock({ children, ...props }: ComponentProps<"pre">) {
  return (
    <div className="code-block">
      <div className="code-window-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <CopyButton />
      <pre {...props} tabIndex={0}>
        {children}
      </pre>
    </div>
  );
}
