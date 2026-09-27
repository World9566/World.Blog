"use client";
import { site } from "@/lib/site";
import { useEffect } from "react";
export default function ErrorPage({ reset }: { reset: () => void }) {
  useEffect(() => {
    let stopped = false;
    let busy = false;
    const controller = new AbortController();
    async function checkStatus() {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const response = await fetch(`${site.status}/api/status`, {
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(5000),
          ]),
        });
        if (!response.ok) return;
        const report = await response.json();
        const confirmed =
          Array.isArray(report.checks) &&
          report.checks.some(
            (check: { status?: string; checkedAt?: string }) => {
              const age = Date.now() - Date.parse(check.checkedAt || "");
              return (
                check.status === "outage" && age >= -60000 && age <= 300000
              );
            },
          );
        if (!stopped && report.status === "outage" && confirmed)
          window.location.replace(`${site.status}/?from=main`);
      } catch {
        /* Keep the retry controls available when status cannot be verified. */
      } finally {
        busy = false;
      }
    }
    void checkStatus();
    const interval = setInterval(checkStatus, 15000);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(interval);
    };
  }, []);
  return (
    <main id="main-content" className="container not-found">
      <p className="eyebrow">稍等一下</p>
      <h1>页面暂时没有加载成功。</h1>
      <p>请稍后再试。</p>
      <button className="button button-primary" onClick={reset}>
        重新加载
      </button>
      <a className="plain-action" href={site.status}>
        查看网站状态
      </a>
    </main>
  );
}
