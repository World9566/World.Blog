"use client";

import { useEffect, useState } from "react";
import { communityFetch, CommunityRequestError } from "@/lib/community-client";
import { operationChecks, type OperationsReport } from "@/lib/operations-types";
import { site } from "@/lib/site";
import { PendingLabel } from "./pending-label";

const labels = {
  ok: "正常",
  pending: "待确认",
  firing: "异常",
  disabled: "未启用",
};
const formatTime = (value: string | number) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(new Date(value));

export function AdminOperations() {
  const [report, setReport] = useState<OperationsReport | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let controller: AbortController | undefined;
    async function refresh() {
      if (inFlight || document.hidden) return;
      inFlight = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      setBusy(true);
      try {
        const data = await communityFetch<OperationsReport>(
          "/api/admin/operations",
          { signal: controller.signal },
        );
        if (!stopped) {
          setReport(data);
          setError("");
        }
      } catch (error) {
        if (!stopped) {
          if (
            error instanceof CommunityRequestError &&
            [401, 403].includes(error.status)
          )
            setReport(null);
          setError(
            error instanceof CommunityRequestError
              ? error.message
              : "状态更新未成功，请重试。",
          );
        }
      } finally {
        clearTimeout(timeout);
        inFlight = false;
        if (!stopped) {
          setBusy(false);
          setNow(Date.now());
        }
      }
    }
    void refresh();
    const interval = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 30000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearInterval(interval);
      controller?.abort();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [revision]);

  const stale =
    report?.status === "stale" ||
    !!(report?.checkedAt && now - Date.parse(report.checkedAt) > 300000);
  const unavailable = !report || report.status === "unavailable";
  const tone =
    stale || error || unavailable
      ? "unknown"
      : report.status === "ok"
        ? "ok"
        : report.checks.some((check) => check.status === "firing")
          ? "firing"
          : "pending";
  const title = stale
    ? "状态记录已过期"
    : unavailable
      ? "暂未获得运行状态"
      : report.status === "ok"
        ? "各项检查正常"
        : "有项目需要关注";
  return (
    <section
      className="account-card admin-panel operations-panel"
      aria-labelledby="admin-section-title"
    >
      <div className="operations-heading">
        <div className="account-section-heading">
          <h2 id="admin-section-title">运行状态</h2>
          <p>检查服务健康，查看最近的告警与恢复记录。</p>
        </div>
        <div className="operations-actions">
          <a
            className="plain-action"
            href={site.status}
            target="_blank"
            rel="noopener noreferrer"
          >
            公开状态页
          </a>
          <button
            className="plain-action"
            disabled={busy}
            onClick={() => setRevision((value) => value + 1)}
          >
            <PendingLabel pending={busy} label="正在更新">
              刷新状态
            </PendingLabel>
          </button>
        </div>
      </div>
      {busy && !report && !error ? (
        <div className="operations-skeleton" role="status">
          <span className="sr-only">正在加载运行状态</span>
          <div aria-hidden="true">
            <div className="skeleton-line operations-skeleton-title" />
            <div className="operations-grid">
              {Object.keys(operationChecks).map((key) => (
                <div className="operations-check" key={key}>
                  <div className="skeleton-line admin-skeleton-name" />
                  <div className="skeleton-line admin-skeleton-body" />
                  <div className="skeleton-line admin-skeleton-meta" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            className={`operations-summary operations-tone-${tone}`}
            role="status"
          >
            <span className="operations-dot" aria-hidden="true" />
            <div>
              <h3>{error ? "暂时无法更新状态" : title}</h3>
              <p>
                {report?.checkedAt
                  ? `最近检查：${formatTime(report.checkedAt)}（北京时间）`
                  : "收到首次检查结果后，将显示在这里。"}
              </p>
              {stale && <p>记录已超过 5 分钟，请检查巡检任务是否正常运行。</p>}
            </div>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {report && !unavailable && (
            <div className="operations-grid">
              {report.checks.map((check) => (
                <div className="operations-check" key={check.id}>
                  <div className="operations-check-title">
                    <h3>{operationChecks[check.id].name}</h3>
                    <span
                      className={`operations-state operations-tone-${stale || error ? "unknown" : check.status}`}
                    >
                      <span className="operations-dot" aria-hidden="true" />
                      {stale || error ? "待更新" : labels[check.status]}
                    </span>
                  </div>
                  <p>{operationChecks[check.id].description}</p>
                  <span className="admin-meta">
                    {check.failures > 0
                      ? `连续 ${check.failures} 次未通过`
                      : `状态起始于 ${formatTime(check.since * 1000)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="operations-history">
            <h3>最近告警</h3>
            {report?.events.length ? (
              <ol>
                {[...report.events].reverse().map((event, index) => (
                  <li key={`${event.check}-${event.at}-${index}`}>
                    <span
                      className={`operations-state operations-tone-${event.status}`}
                    >
                      <span className="operations-dot" aria-hidden="true" />
                      {event.status === "ok" ? "已恢复" : labels[event.status]}
                    </span>
                    <span>{operationChecks[event.check].name}</span>
                    <time dateTime={event.at}>{formatTime(event.at)}</time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="admin-meta">
                {unavailable ? "暂无可用记录。" : "当前没有告警记录。"}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
