export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const labels = {
  operational: "运行正常",
  degraded: "正在确认",
  outage: "暂时不可用",
  unknown: "待更新",
};
const headlines = {
  operational: "各项服务运行正常。",
  degraded: "正在确认访问情况。",
  outage: "部分服务暂时不可用。",
  unknown: "状态暂未更新。",
};
const descriptions = {
  operational: "你可以继续阅读文章，探索感兴趣的内容。",
  degraded: "部分检查未能通过，我们会持续确认并更新结果。",
  outage: "部分访问受到影响。恢复后，最新结果会显示在这里。",
  unknown: "暂时无法确认网站的当前状态。请稍后刷新，或尝试访问网站。",
};
const state = (value) => (Object.hasOwn(labels, value) ? value : "unknown");
const date = (value) => {
  if (!value || !Number.isFinite(Date.parse(value))) return "暂无记录";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
};
const percentage = (passed, total) =>
  total ? `${((passed / total) * 100).toFixed(2)}%` : "暂无数据";
function historyState(day, index) {
  if (!day.total) return "unknown";
  if (day.passed < day.total) return "outage";
  return index < 29 && day.total < 1152 ? "unknown" : "operational";
}

export function renderStatus(report) {
  const overall = state(report.status);
  const checks = report.checks || [];
  const checked = checks
    .map((check) => check.checkedAt)
    .filter(Boolean)
    .sort()
    .at(0);
  const names = Object.fromEntries(
    checks.map((check) => [check.id, check.name]),
  );
  return `<section class="summary tone-${overall}" aria-labelledby="status-heading"><span class="summary-symbol" aria-hidden="true">${overall === "operational" ? "✓" : overall === "outage" ? "!" : "·"}</span><h1 id="status-heading">${headlines[overall]}</h1><p class="lead">${descriptions[overall]}</p><p class="timestamp">最近检查：<time>${escapeHtml(date(checked))}</time></p></section>
  <section class="services" aria-labelledby="services-heading"><div class="section-heading"><h2 id="services-heading">服务可用情况</h2><span>最近 30 天</span></div><div class="service-list">${checks
    .map((check) => {
      const status = state(check.status);
      const passed = check.history.reduce((sum, day) => sum + day.passed, 0);
      const total = check.history.reduce((sum, day) => sum + day.total, 0);
      return `<article class="service"><div class="service-heading"><h3>${escapeHtml(check.name)}</h3><span class="component-state tone-${status}"><i class="dot" aria-hidden="true"></i>${labels[status]}</span></div><div class="history" aria-hidden="true">${check.history.map((day, index) => `<i class="bar tone-${historyState(day, index)}" title="${escapeHtml(day.day)}：${day.total ? `${day.passed}/${day.total} 次检查通过` : "暂无数据"}"></i>`).join("")}</div><div class="history-caption"><span>${escapeHtml(check.history[0]?.day || "")}</span><span>检查通过率 ${percentage(passed, total)}</span><span>今天</span></div></article>`;
    })
    .join(
      "",
    )}</div><div class="legend"><span><i class="dot tone-operational"></i>正常</span><span><i class="dot tone-outage"></i>出现异常</span><span><i class="dot tone-unknown"></i>数据不足</span></div><p class="history-note">可用情况来自定时访问检查，不代表每个地区的连接质量。尚未收集的时段不会计为正常。</p><details><summary>查看每日检查明细</summary><div class="table-scroll"><table><caption>每日检查结果</caption><thead><tr><th>日期</th>${checks.map((check) => `<th>${escapeHtml(check.name)}</th>`).join("")}</tr></thead><tbody>${(
    checks[0]?.history || []
  )
    .map(
      (day, index) =>
        `<tr><th>${escapeHtml(day.day)}</th>${checks
          .map((check) => {
            const value = check.history[index];
            return `<td>${value.total ? `${value.passed}/${value.total} 次通过` : "暂无数据"}</td>`;
          })
          .join("")}</tr>`,
    )
    .reverse()
    .join("")}</tbody></table></div></details></section>
  <section class="incidents" aria-labelledby="incidents-heading"><div class="section-heading"><h2 id="incidents-heading">故障与恢复记录</h2><span>最近 90 天</span></div>${report.incidents?.length ? `<ol>${report.incidents.map((incident) => `<li><div class="incident-heading"><h3>${escapeHtml(names[incident.component] || "网站访问")}访问异常</h3><span class="component-state tone-${incident.resolvedAt ? "operational" : "outage"}">${incident.resolvedAt ? "已恢复" : "尚未恢复"}</span></div><p>${incident.resolvedAt ? "访问已恢复，相关检查已通过。" : "已连续检测到访问异常，正在持续检查。"}</p><time>开始于 ${escapeHtml(date(incident.startedAt))}${incident.resolvedAt ? ` · 恢复于 ${escapeHtml(date(incident.resolvedAt))}` : ""}</time></li>`).join("")}</ol>` : `<div class="empty"><span aria-hidden="true">${overall === "operational" ? "✓" : "·"}</span><h3>${checked ? "暂无已确认的故障记录" : "等待首次检查"}</h3><p>${checked ? "新的故障与恢复记录会在这里更新。" : "检查开始后，服务状态和历史记录将逐步更新。"}</p></div>`}</section>`;
}

if (typeof document !== "undefined") {
  const button = document.querySelector("#refresh");
  const error = document.querySelector("#refresh-error");
  let busy = false;
  if (new URL(location.href).searchParams.get("from") === "main")
    document.querySelector("#redirect-note").hidden = false;
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      const response = await fetch("/api/status", {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Unavailable");
      const report = await response.json();
      const content = document.querySelector("#status-content");
      const expanded = content.querySelector("details")?.open;
      const summaryFocused =
        document.activeElement === content.querySelector("summary");
      content.innerHTML = renderStatus(report);
      if (expanded) content.querySelector("details").open = true;
      if (summaryFocused)
        content.querySelector("summary").focus({ preventScroll: true });
      error.hidden = true;
    } catch {
      error.textContent =
        "暂时无法更新状态，以下历史记录仅供参考。请稍后重试。";
      error.hidden = false;
      const summary = document.querySelector(".summary");
      summary.className = "summary tone-unknown";
      summary.querySelector("h1").textContent = headlines.unknown;
      summary.querySelector(".summary-symbol").textContent = "·";
      summary.querySelector(".lead").textContent = descriptions.unknown;
      for (const badge of document.querySelectorAll(
        ".service .component-state",
      )) {
        badge.className = "component-state tone-unknown";
        badge.textContent = labels.unknown;
      }
    } finally {
      busy = false;
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
  button.addEventListener("click", refresh);
  setInterval(refresh, 60000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refresh();
  });
}
