"use client";

import { useRef, useState } from "react";
import { Icon } from "./icon";

export function CopyButton({ share = false }: { share?: boolean }) {
  const button = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      const text = share
        ? `${window.location.origin}${window.location.pathname}`
        : button.current?.closest(".code-block")?.querySelector("pre code")
            ?.textContent;
      if (!text) throw new Error("Nothing to copy");
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }
  return (
    <span className="copy-control">
      <button
        ref={button}
        type="button"
        className={share ? "button button-secondary share-button" : "code-copy"}
        onClick={copy}
        aria-label={share ? "复制文章链接" : "复制代码"}
      >
        <Icon
          name={status === "copied" ? "check" : share ? "link" : "copy"}
          width="16"
          height="16"
        />
        <span>
          {status === "copied" ? "已复制" : share ? "复制链接" : "复制"}
        </span>
      </button>
      <span
        role="status"
        className={status === "failed" ? "copy-error" : "sr-only"}
      >
        {status === "failed"
          ? share
            ? "复制失败，请复制浏览器地址栏中的链接。"
            : "复制失败，请选中代码后手动复制。"
          : status === "copied"
            ? share
              ? "文章链接已复制"
              : "代码已复制"
            : ""}
      </span>
    </span>
  );
}
