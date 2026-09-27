import { escapeHtml, renderStatus } from "./public/page.js";

export function renderPage(report, mainOrigin) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="description" content="查看 World 网站的当前访问状态、近期可用情况与故障恢复记录。"><title>网站状态 · World</title><link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css"><script type="module" src="/page.js"></script></head>
<body><a class="skip" href="#main-content">跳到正文</a><header class="shell"><a class="wordmark" href="/" aria-label="World 网站状态首页">World<span>.</span></a><span class="header-label">网站状态</span><div class="header-actions"><button id="refresh" type="button" aria-label="刷新状态" title="刷新状态"><span class="refresh-icon" aria-hidden="true">↻</span><span class="refresh-label">刷新</span></button><a class="return-link" href="${escapeHtml(mainOrigin)}" rel="noreferrer">访问网站 <span aria-hidden="true">↗</span></a></div></header>
<main id="main-content" class="shell"><p id="redirect-note" class="notice" hidden>刚才的页面暂时无法访问。你可以在这里查看网站状态，或稍后返回重试。</p><p id="refresh-error" class="notice" role="status" hidden></p><div id="status-content">${renderStatus(report)}</div></main>
<footer class="shell"><span>World · 保持好奇</span><span>每分钟检查 · 时间显示为北京时间</span></footer></body></html>`;
}
