"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ActivityPage } from "@/lib/community-policy";
import {
  communityDate,
  communityFetch,
  CommunityRequestError,
  jsonMutation,
} from "@/lib/community-client";
import { Icon } from "./icon";
import { ActivitySkeleton } from "./community-skeleton";
import { PendingLabel } from "./pending-label";

export function AccountActivity() {
  const [kind, setKind] = useState<"bookmarks" | "comments">("bookmarks");
  const [data, setData] = useState<ActivityPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const busy = pending !== null;
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [loadingHeight, setLoadingHeight] = useState(0);
  function beginLoading() {
    setLoadingHeight(resultsRef.current?.getBoundingClientRect().height || 0);
    setLoading(true);
    setData(null);
    setError("");
  }
  function switchKind(next: typeof kind) {
    if (next === kind || busy) return;
    beginLoading();
    setKind(next);
  }
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setError("");
    communityFetch<ActivityPage>(`/api/account/activity?kind=${kind}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof CommunityRequestError
              ? error.message
              : "暂时无法加载，请稍后重试。",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, revision]);
  async function more() {
    if (!data?.nextPage || busy) return;
    setPending("more");
    setError("");
    try {
      const next = await communityFetch<ActivityPage>(
        `/api/account/activity?kind=${kind}&page=${data.nextPage}`,
      );
      setData((previous) => ({
        ...next,
        items: [
          ...(previous?.items || []),
          ...next.items.filter(
            (item) => !previous?.items.some((old) => old.id === item.id),
          ),
        ],
      }));
    } catch (error) {
      setError(
        error instanceof CommunityRequestError
          ? error.message
          : "暂时无法加载，请稍后重试。",
      );
    } finally {
      setPending(null);
    }
  }
  async function remove(articleId: string) {
    if (busy) return;
    setPending(articleId);
    setError("");
    try {
      await communityFetch(
        `/api/articles/${encodeURIComponent(articleId)}/community`,
        jsonMutation("PUT", { kind: "bookmark", active: false }),
      );
      beginLoading();
      setRevision((value) => value + 1);
    } catch (error) {
      setError(
        error instanceof CommunityRequestError
          ? error.message
          : "暂时无法完成操作，请稍后重试。",
      );
    } finally {
      setPending(null);
    }
  }
  return (
    <section id="reading" className="account-card">
      <div className="account-section-heading">
        <h2>我的阅读</h2>
        <p>保存值得回看的文章，继续参与过的讨论。</p>
      </div>
      <nav
        className="activity-tabs nested-tabbar secondary-tabbar"
        aria-label="阅读记录类型"
      >
        <button
          className="secondary-tab"
          aria-pressed={kind === "bookmarks"}
          disabled={busy}
          onClick={() => switchKind("bookmarks")}
        >
          <Icon name="bookmark" />
          我的收藏
        </button>
        <button
          className="secondary-tab"
          aria-pressed={kind === "comments"}
          disabled={busy}
          onClick={() => switchKind("comments")}
        >
          <Icon name="comment" />
          我的评论
        </button>
      </nav>
      <div
        ref={resultsRef}
        className="activity-results"
        aria-busy={loading}
        style={
          loading && loadingHeight ? { minHeight: loadingHeight } : undefined
        }
      >
        {loading && <ActivitySkeleton kind={kind} />}
        {error && (
          <div className="community-notice">
            <p className="form-error" role="alert">
              {error}
            </p>
            <button
              className="plain-action"
              onClick={() => {
                beginLoading();
                setRevision((value) => value + 1);
              }}
            >
              重试
            </button>
          </div>
        )}
        {data && !data.items.length && (
          <div className="activity-empty">
            <p>
              {kind === "bookmarks"
                ? "还没有收藏的文章。"
                : "还没有参与过讨论。"}
            </p>
            <Link href="/articles" className="text-link">
              去读一篇 <Icon name="arrow" />
            </Link>
          </div>
        )}
        {!!data?.items.length && (
          <ul className="activity-list">
            {data.items.map((item) => (
              <li key={item.id}>
                <div>
                  <Link href={item.href} className="activity-title">
                    {item.title}
                    <Icon name="arrow" width="18" height="18" />
                  </Link>
                  {item.body && <p className="activity-excerpt">{item.body}</p>}
                  <time dateTime={item.createdAt}>
                    {communityDate(item.createdAt)}
                  </time>
                </div>
                {kind === "bookmarks" && (
                  <button
                    className="plain-action muted-action"
                    disabled={busy}
                    aria-busy={pending === item.articleId}
                    onClick={() => remove(item.articleId)}
                    aria-label={`取消收藏：${item.title}`}
                  >
                    <PendingLabel
                      pending={pending === item.articleId}
                      label="正在取消收藏"
                    >
                      取消收藏
                    </PendingLabel>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {data?.nextPage && (
          <button
            className="plain-action"
            disabled={busy}
            aria-busy={pending === "more"}
            onClick={more}
          >
            <PendingLabel pending={pending === "more"} label="正在加载更多记录">
              查看更多
            </PendingLabel>
          </button>
        )}
      </div>
    </section>
  );
}
