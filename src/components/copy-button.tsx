"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";

export function CopyButton({
  share = false,
  compact = false,
}: {
  share?: boolean;
  compact?: boolean;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );
  function showTemporaryStatus(next: "copied" | "failed") {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setStatus(next);
    resetTimer.current = setTimeout(() => {
      setStatus("idle");
      resetTimer.current = null;
    }, 2500);
  }
  async function copy() {
    try {
      const text = share
        ? `${window.location.origin}${window.location.pathname}`
        : button.current?.closest(".code-block")?.querySelector("pre code")
            ?.textContent;
      if (!text) throw new Error("Nothing to copy");
      await navigator.clipboard.writeText(text);
      showTemporaryStatus("copied");
    } catch {
      showTemporaryStatus("failed");
    }
  }
  return (
    <span
      className={compact ? "copy-control article-action-copy" : "copy-control"}
    >
      <button
        ref={button}
        type="button"
        className={
          compact
            ? "article-action-button"
            : share
              ? "button button-secondary share-button"
              : "code-copy"
        }
        onClick={copy}
        aria-label={share ? "复制文章链接以分享" : "复制代码"}
        title={
          compact
            ? status === "copied"
              ? "已复制链接"
              : "分享文章"
            : undefined
        }
      >
        <Icon
          name={status === "copied" ? "check" : share ? "link" : "copy"}
          width="16"
          height="16"
        />
        <span className={compact ? "sr-only" : undefined}>
          {status === "copied" ? "已复制" : share ? "复制链接" : "复制"}
        </span>
      </button>
      {share ? (
        status !== "idle" &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`copy-toast${status === "failed" ? " copy-toast-error" : ""}`}
            role={status === "failed" ? "alert" : "status"}
          >
            <Icon
              name={status === "copied" ? "check" : "close"}
              width="17"
              height="17"
            />
            <span>
              {status === "copied"
                ? "链接已复制至剪贴板"
                : "复制失败，请复制浏览器地址栏中的链接。"}
            </span>
          </div>,
          document.body,
        )
      ) : (
        <span
          role="status"
          className={status === "failed" ? "copy-error" : "sr-only"}
        >
          {status === "failed"
            ? "复制失败，请选中代码后手动复制。"
            : status === "copied"
              ? "代码已复制"
              : ""}
        </span>
      )}
    </span>
  );
}
