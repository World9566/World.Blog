"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { authClient } from "@/lib/auth-client";
import {
  COMMENT_LIMIT,
  type CommentPage,
  type CommentView,
  type InteractionState,
} from "@/lib/community-policy";
import {
  communityDate,
  communityFetch,
  CommunityRequestError,
  jsonMutation,
} from "@/lib/community-client";
import { Icon } from "./icon";
import { UserAvatar } from "./user-avatar";

type CommunityData = { state: InteractionState; comments: CommentPage };
const messageOf = (error: unknown) =>
  error instanceof CommunityRequestError
    ? error.message
    : "暂时无法加载，请稍后重试。";

function CommentComposer({
  api,
  parentId = null,
  onPosted,
  onCancel,
}: {
  api: string;
  parentId?: string | null;
  onPosted: () => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const fieldId = parentId ? `reply-${parentId}` : "new-comment";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true);
    setError("");
    requestId.current ||= crypto.randomUUID();
    try {
      await communityFetch(
        `${api}/comments`,
        jsonMutation("POST", { body, parentId, requestId: requestId.current }),
      );
      setBody("");
      requestId.current = null;
      onPosted();
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="comment-composer" onSubmit={submit}>
      <div className="form-field">
        <label htmlFor={fieldId}>
          {parentId ? "你的回复" : "写下你的想法"}
        </label>
        <textarea
          id={fieldId}
          value={body}
          maxLength={COMMENT_LIMIT}
          rows={3}
          required
          disabled={busy}
          onChange={(event) => {
            setBody(event.target.value);
            requestId.current = null;
            setError("");
          }}
          placeholder={
            parentId ? "继续这段讨论…" : "一个问题，一点补充，或一次实践。"
          }
          aria-describedby={`${fieldId}-count`}
        />
        <p id={`${fieldId}-count`} className="field-hint field-count">
          {body.length} / {COMMENT_LIMIT}
        </p>
      </div>
      <div className="form-actions">
        <button
          className="button button-primary"
          disabled={busy || !body.trim()}
        >
          {busy ? "正在发布…" : parentId ? "发布回复" : "发布评论"}
        </button>
        {onCancel && (
          <button
            className="plain-action"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            取消
          </button>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

function CommentEntry({
  comment,
  api,
  onDeleted,
  children,
}: {
  comment: CommentView;
  api: string;
  onDeleted: () => void;
  children?: React.ReactNode;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await communityFetch(
        `${api}/comments/${comment.id}`,
        jsonMutation("DELETE", {}),
      );
      setConfirm(false);
      onDeleted();
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="comment-entry" id={`comment-${comment.id}`}>
      {comment.author && (
        <div className="comment-author">
          <UserAvatar {...comment.author} />
          <span>{comment.author.name}</span>
          <time dateTime={comment.createdAt}>
            {communityDate(comment.createdAt)}
          </time>
        </div>
      )}
      <p className={`comment-body${comment.deleted ? " comment-deleted" : ""}`}>
        {comment.deleted ? "这条评论已删除。" : comment.body}
      </p>
      <div className="comment-actions">
        {children}
        {comment.mine && !confirm && (
          <button
            className="plain-action muted-action"
            onClick={() => setConfirm(true)}
          >
            删除
          </button>
        )}
        {confirm && (
          <div className="comment-confirm">
            <span>删除这条评论？</span>
            <button className="plain-action" disabled={busy} onClick={remove}>
              {busy ? "正在删除…" : "确认删除"}
            </button>
            <button
              className="plain-action muted-action"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              取消
            </button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}

function CommentThread({
  comment,
  api,
  signedIn,
  loginHref,
  version,
  onChanged,
}: {
  comment: CommentView;
  api: string;
  signedIn: boolean;
  loginHref: string;
  version: number;
  onChanged: (message: string) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [replies, setReplies] = useState<CommentPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const url = `${api}/comments?parentId=${comment.id}`;
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setReplies(null);
    communityFetch<CommentPage>(url, { signal: controller.signal })
      .then(setReplies)
      .catch((error) => {
        if (!controller.signal.aborted) setError(messageOf(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [expanded, url, version]);
  async function more() {
    setBusy(true);
    setError("");
    try {
      const page = await communityFetch<CommentPage>(
        `${url}${replies?.nextCursor ? `&cursor=${replies.nextCursor}` : ""}`,
      );
      setReplies((previous) => ({
        ...page,
        items: [
          ...(previous?.items || []),
          ...page.items.filter(
            (item) => !previous?.items.some((old) => old.id === item.id),
          ),
        ],
      }));
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="comment-thread">
      <CommentEntry
        comment={comment}
        api={api}
        onDeleted={() => onChanged("评论已删除。")}
      >
        {!comment.deleted &&
          (signedIn ? (
            <button
              className="plain-action"
              aria-expanded={replying}
              onClick={() => setReplying(!replying)}
            >
              回复
            </button>
          ) : (
            <Link className="plain-action" href={loginHref}>
              登录后回复
            </Link>
          ))}
        {comment.replyCount > 0 && (
          <button
            className="plain-action"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "收起回复" : `查看 ${comment.replyCount} 条回复`}
          </button>
        )}
      </CommentEntry>
      {replying && signedIn && !comment.deleted && (
        <div className="reply-composer">
          <CommentComposer
            api={api}
            parentId={comment.id}
            onCancel={() => setReplying(false)}
            onPosted={() => {
              setReplying(false);
              setExpanded(true);
              onChanged("回复已发布。");
            }}
          />
        </div>
      )}
      {expanded && (
        <div className="comment-replies">
          {replies?.items.map((reply) => (
            <CommentEntry
              key={reply.id}
              comment={reply}
              api={api}
              onDeleted={() => onChanged("回复已删除。")}
            />
          ))}
          {busy && (
            <p className="community-muted" role="status">
              正在加载回复…
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {(replies?.nextCursor || error) && (
            <button className="plain-action" disabled={busy} onClick={more}>
              {error ? "重试" : "更多回复"}
            </button>
          )}
          {replies && !replies.items.length && !busy && (
            <p className="community-muted">暂无回复。</p>
          )}
        </div>
      )}
    </li>
  );
}

export function ArticleCommunity({
  articleId,
  slug,
}: {
  articleId: string;
  slug: string;
}) {
  const { data: session, isPending } = authClient.useSession();
  const viewer = session?.user.id;
  const api = `/api/articles/${encodeURIComponent(articleId)}`;
  const loginHref = `/login?next=${encodeURIComponent(`/articles/${slug}#comments`)}`;
  const [data, setData] = useState<CommunityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  const reload = useCallback(
    async (signal?: AbortSignal) => {
      setError("");
      try {
        const next = await communityFetch<CommunityData>(`${api}/community`, {
          signal,
        });
        setData(next);
        setVersion((value) => value + 1);
      } catch (error) {
        if (!signal?.aborted) setError(messageOf(error));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [api],
  );
  useEffect(() => {
    if (isPending) return;
    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setNotice("");
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload, viewer, isPending]);
  async function react(kind: "like" | "bookmark") {
    if (!data || busy) return;
    if (!viewer) {
      window.location.assign(loginHref);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const active = kind === "like" ? !data.state.liked : !data.state.bookmarked;
    try {
      const result = await communityFetch<{ state: InteractionState }>(
        `${api}/community`,
        jsonMutation("PUT", { kind, active }),
      );
      setData((previous) =>
        previous ? { ...previous, state: result.state } : previous,
      );
      setNotice(
        kind === "like"
          ? active
            ? "已点赞。"
            : "已取消点赞。"
          : active
            ? "已加入收藏，可在个人中心查看。"
            : "已取消收藏。",
      );
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!data?.comments.nextCursor || busy) return;
    setBusy(true);
    setError("");
    try {
      const page = await communityFetch<CommentPage>(
        `${api}/comments?cursor=${data.comments.nextCursor}`,
      );
      setData((previous) =>
        previous
          ? {
              ...previous,
              comments: {
                ...page,
                items: [
                  ...previous.comments.items,
                  ...page.items.filter(
                    (item) =>
                      !previous.comments.items.some(
                        (old) => old.id === item.id,
                      ),
                  ),
                ],
              },
            }
          : previous,
      );
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  const changed = (message: string) => {
    setNotice(message);
    void reload();
  };
  return (
    <section
      className="community-section container"
      id="comments"
      aria-labelledby="comments-heading"
    >
      <div className="article-reactions" aria-label="文章互动">
        <button
          className="reaction-button"
          aria-pressed={data?.state.liked || false}
          disabled={!data || busy}
          onClick={() => react("like")}
        >
          <Icon name="heart" />
          <span>{data?.state.liked ? "已点赞" : "点赞"}</span>
          {data && <span className="reaction-count">{data.state.likes}</span>}
        </button>
        <button
          className="reaction-button"
          aria-pressed={data?.state.bookmarked || false}
          disabled={!data || busy}
          onClick={() => react("bookmark")}
        >
          <Icon name="bookmark" />
          <span>{data?.state.bookmarked ? "已收藏" : "收藏文章"}</span>
        </button>
      </div>
      <div className="discussion-heading">
        <div>
          <p className="eyebrow">一起聊聊</p>
          <h2 id="comments-heading">
            评论{data ? <span>{data.state.comments}</span> : null}
          </h2>
        </div>
        <p>好问题，让理解更进一步。</p>
      </div>
      {loading ? (
        <p className="community-muted" role="status">
          正在加载讨论…
        </p>
      ) : viewer ? (
        <CommentComposer api={api} onPosted={() => changed("评论已发布。")} />
      ) : (
        <div className="comment-login">
          <p>登录后，分享你的想法。</p>
          <Link className="button button-primary" href={loginHref}>
            <Icon name="github" />
            使用 GitHub 继续
          </Link>
        </div>
      )}
      {notice && (
        <p className="form-success community-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="community-notice">
          <p role="alert" className="form-error">
            {error}
          </p>
          <button className="plain-action" onClick={() => void reload()}>
            重新加载
          </button>
          {!viewer && (
            <Link href={loginHref} className="plain-action">
              去登录
            </Link>
          )}
        </div>
      )}
      {data && (
        <>
          {data.comments.items.length ? (
            <ol className="comment-list">
              {data.comments.items.map((comment) => (
                <CommentThread
                  key={`${viewer || "guest"}-${comment.id}`}
                  comment={comment}
                  api={api}
                  signedIn={!!viewer}
                  loginHref={loginHref}
                  version={version}
                  onChanged={changed}
                />
              ))}
            </ol>
          ) : (
            <div className="discussion-empty">
              <Icon name="comment" width="28" height="28" />
              <p>还没有评论，期待你的第一条见解。</p>
            </div>
          )}
          {data.comments.nextCursor && (
            <button
              className="button button-secondary comment-more"
              disabled={busy}
              onClick={more}
            >
              {busy ? "正在加载…" : "更多评论"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
