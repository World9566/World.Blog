"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export function NavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = `${pathname}?${searchParams.toString()}`;
  const [pending, setPending] = useState(false);
  const pendingAnchor = useRef<HTMLAnchorElement | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    pendingAnchor.current?.removeAttribute("data-navigation-pending");
    pendingAnchor.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = null;
    setPending(false);
  }, []);

  useEffect(() => clear(), [route, clear]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      )
        return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (
        !anchor ||
        (anchor.target && anchor.target !== "_self") ||
        anchor.hasAttribute("download")
      )
        return;
      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin) return;
      const instantFilters = anchor.closest("[data-instant-filters]");
      if (
        instantFilters &&
        url.pathname ===
          (instantFilters.getAttribute("data-instant-filters") || "/articles")
      )
        return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      )
        return;
      pendingAnchor.current?.removeAttribute("data-navigation-pending");
      anchor.setAttribute("data-navigation-pending", "");
      pendingAnchor.current = anchor;
      if (showTimer.current) clearTimeout(showTimer.current);
      // Avoid flashing the indicator for cached or immediate navigations.
      showTimer.current = setTimeout(() => {
        setPending(true);
        showTimer.current = null;
      }, 120);
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(clear, 15000);
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("pageshow", clear);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pageshow", clear);
      if (timeout.current) clearTimeout(timeout.current);
      if (showTimer.current) clearTimeout(showTimer.current);
    };
  }, [clear]);

  return (
    <div
      className="navigation-progress"
      data-visible={pending ? "true" : "false"}
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{pending ? "正在打开页面" : ""}</span>
    </div>
  );
}
