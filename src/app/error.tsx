"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="container not-found">
      <p className="eyebrow">稍等一下</p>
      <h1>页面暂时没有加载成功。</h1>
      <p>请稍后再试。</p>
      <button className="button button-primary" onClick={reset}>
        重新加载
      </button>
    </main>
  );
}
