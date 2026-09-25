"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  adminActions,
  type AdminAction,
  type AdminUser,
  type AdminComment,
  type AuditView,
  type AdminPage,
} from "@/lib/admin-policy";
import {
  communityDate,
  communityFetch,
  CommunityRequestError,
  jsonMutation,
} from "@/lib/community-client";
import { UserAvatar } from "./user-avatar";

type Section = "comments" | "users" | "audit";
type Row = AdminComment | AdminUser | AuditView;
type Target = {
  id: string;
  type: "comments" | "users";
  label: string;
  action: AdminAction;
  thread?: boolean;
  parentHidden?: boolean;
};
const sections = { comments: "评论审核", users: "用户管理", audit: "操作记录" };
const filters = {
  comments: {
    all: "全部评论",
    pending: "待审核",
    published: "已通过",
    hidden: "已隐藏",
    deleted: "已删除",
  },
  users: {
    all: "全部用户",
    active: "正常使用",
    banned: "已停用",
    admin: "管理员",
  },
  audit: { all: "全部操作", user: "用户操作", comment: "评论操作" },
};
const commentLabels = {
  pending: "待审核",
  published: "已通过",
  hidden: "已隐藏",
  deleted: "已删除",
};
const errorMessage = (error: unknown) =>
  error instanceof CommunityRequestError
    ? error.message
    : "暂时无法完成操作，请稍后重试。";
const auditDate = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(new Date(value));

function Confirmation({
  target,
  onClose,
  onDone,
}: {
  target: Target;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  const impact =
    target.action === "user.ban"
      ? "该用户将退出所有设备，无法登录、评论或收藏。恢复账号后可重新登录。"
      : target.action === "user.unban"
        ? "该用户可以重新使用 GitHub 登录，原有登录不会恢复。"
        : target.action === "user.promote"
          ? "该用户将可以管理用户和评论。所有已登录设备会退出，重新登录后生效。"
          : target.action === "user.demote"
            ? "该用户将失去管理权限。所有已登录设备会退出，重新登录后仍可阅读和参与讨论。"
            : target.action === "comment.hide"
              ? target.thread
                ? "这条评论及其所有回复将停止公开展示。之后可以恢复。"
                : "这条回复将停止公开展示，之后可以恢复。"
              : target.action === "comment.delete"
                ? "正文将永久清除，无法恢复。已有回复会保留，隐藏的讨论仍保持隐藏。"
                : target.action === "comment.restore"
                  ? target.parentHidden
                    ? "这条回复将恢复；所属评论仍被隐藏，需要恢复所属评论后才能公开展示。"
                    : target.thread
                      ? "这条评论和未被单独隐藏的回复将重新公开展示。"
                      : "这条回复将重新公开展示。"
                  : "这条评论将标记为已通过，当前可见范围保持不变。";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await communityFetch<{ message: string }>(
        `/api/admin/${target.type}/${encodeURIComponent(target.id)}`,
        jsonMutation("POST", { action: target.action, reason }),
      );
      onDone(result.message);
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="admin-dialog"
      aria-labelledby="admin-confirm-title"
      aria-describedby="admin-confirm-impact"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <p className="eyebrow">确认操作</p>
        <h2 id="admin-confirm-title">{adminActions[target.action]}</h2>
        <p className="admin-target">{target.label}</p>
        <p id="admin-confirm-impact">{impact}</p>
        <div className="form-field">
          <label htmlFor="admin-reason">
            操作原因 <span>将保留在操作记录中</span>
          </label>
          <input
            id="admin-reason"
            autoFocus
            required
            minLength={2}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="简要说明原因"
            disabled={busy}
          />
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            className="button button-primary"
            disabled={busy || reason.trim().length < 2}
          >
            {busy ? "正在处理…" : "确认"}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function AdminDashboard() {
  const [section, setSection] = useState<Section>("comments");
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<AdminPage<Row> | null>(null);
  const [overview, setOverview] = useState<{
    users: number;
    pending: number;
    hidden: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ status, q, page: String(page) });
    Promise.all([
      communityFetch<AdminPage<Row>>(`/api/admin/${section}?${params}`, {
        signal: controller.signal,
      }),
      communityFetch<{ users: number; pending: number; hidden: number }>(
        "/api/admin/overview",
        { signal: controller.signal },
      ),
    ])
      .then(([result, overview]) => {
        if (controller.signal.aborted) return;
        if (page > result.pages) {
          setPage(result.pages);
          return;
        }
        setData(result);
        setOverview(overview);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(error));
          setOverview(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [section, status, q, page, revision]);
  function select(next: Section, filter = "all") {
    setSection(next);
    setStatus(filter);
    setPage(1);
    setQ("");
    setSearch("");
    setNotice("");
  }
  function action(row: AdminUser | AdminComment, action: AdminAction) {
    setNotice("");
    setTarget(
      "githubId" in row
        ? { id: row.id, type: "users", label: row.name, action }
        : {
            id: row.id,
            type: "comments",
            label: `${row.author.name} · ${row.article.title}`,
            action,
            thread: !row.parentId,
            parentHidden: row.parentHidden,
          },
    );
  }
  return (
    <div className="container admin-content">
      <nav
        className="activity-tabs admin-tabs secondary-tabbar"
        aria-label="管理中心导航"
      >
        {(Object.keys(sections) as Section[]).map((key) => (
          <button
            key={key}
            className="secondary-tab"
            aria-pressed={section === key}
            onClick={() => select(key)}
          >
            <span>{sections[key]}</span>
            <span className="admin-nav-meta">
              {key === "comments"
                ? overview
                  ? `待审核 ${overview.pending} · 已隐藏 ${overview.hidden}`
                  : "正在加载…"
                : key === "users"
                  ? overview
                    ? `${overview.users} 位用户`
                    : "正在加载…"
                  : "查看管理操作"}
            </span>
          </button>
        ))}
      </nav>
      <section
        className="account-card admin-panel"
        aria-labelledby="admin-section-title"
      >
        <div className="admin-panel-header">
          <div className="account-section-heading">
            <h2 id="admin-section-title">{sections[section]}</h2>
            <p>
              {section === "comments"
                ? "新评论发布后立即可见。审核讨论，让交流保持友善。"
                : section === "users"
                  ? "查看读者，管理账号状态与权限。"
                  : "查看操作人、变更内容和原因。"}
            </p>
          </div>
          <form
            className="admin-filters"
            role="search"
            aria-label={`${sections[section]}搜索`}
            onSubmit={(event) => {
              event.preventDefault();
              setQ(search.trim());
              setPage(1);
              setRevision((value) => value + 1);
            }}
          >
            <div className="form-field">
              <label htmlFor="admin-search">搜索</label>
              <input
                id="admin-search"
                type="search"
                maxLength={100}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  section === "users"
                    ? "昵称、GitHub 用户名或 ID"
                    : section === "comments"
                      ? "评论、作者或文章"
                      : "操作人、对象或原因"
                }
              />
            </div>
            <div className="form-field">
              <label htmlFor="admin-filter">筛选</label>
              <select
                id="admin-filter"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                {Object.entries(filters[section]).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button className="button button-primary" type="submit">
              搜索
            </button>
          </form>
        </div>
        {notice && (
          <p role="status" className="form-success">
            {notice}
          </p>
        )}
        {loading && (
          <p role="status" className="activity-empty">
            正在加载…
          </p>
        )}
        {error && (
          <div className="community-notice">
            <p role="alert" className="form-error">
              {error}
            </p>
            <button
              className="plain-action"
              onClick={() => setRevision((value) => value + 1)}
            >
              重试
            </button>
            <Link href="/login?next=%2Fadmin" className="plain-action">
              重新登录
            </Link>
          </div>
        )}
        {data && !data.items.length && (
          <div className="activity-empty">
            <p>
              {q
                ? "没有找到匹配的记录。"
                : section === "comments" && status === "pending"
                  ? "所有评论都已查看，暂时没有待审核的讨论。"
                  : "这里暂时没有记录。"}
            </p>
          </div>
        )}
        {data && !!data.items.length && (
          <ul className="admin-list">
            {data.items.map((row) => (
              <li key={row.id}>
                {"githubId" in row ? (
                  <>
                    <div className="admin-row-top">
                      <div className="admin-person">
                        <UserAvatar name={row.name} image={row.image} />
                        <h3>{row.name}</h3>
                      </div>
                      <div className="admin-badges">
                        <span className="role-badge">
                          {row.role === "admin" ? "管理员" : "读者"}
                        </span>
                        {row.banned && (
                          <span className="admin-badge">已停用</span>
                        )}
                        {row.self && (
                          <span className="admin-badge">当前账号</span>
                        )}
                      </div>
                    </div>
                    <p className="admin-meta">
                      {row.githubUsername
                        ? `@${row.githubUsername}`
                        : "GitHub 用户"}
                      {row.githubId && ` · ID ${row.githubId}`}
                    </p>
                    <p className="admin-meta">
                      加入于 {communityDate(row.createdAt)} · {row.comments}{" "}
                      条评论
                    </p>
                    {row.banned && row.banReason && (
                      <p className="admin-reason">停用原因：{row.banReason}</p>
                    )}
                    <div className="admin-row-actions">
                      <button
                        className="plain-action"
                        disabled={row.self}
                        onClick={() =>
                          action(row, row.banned ? "user.unban" : "user.ban")
                        }
                      >
                        {row.banned ? "恢复账号" : "停用账号"}
                      </button>
                      <button
                        className="plain-action"
                        disabled={
                          row.self || (row.banned && row.role !== "admin")
                        }
                        onClick={() =>
                          action(
                            row,
                            row.role === "admin"
                              ? "user.demote"
                              : "user.promote",
                          )
                        }
                      >
                        {row.role === "admin" ? "设为普通用户" : "设为管理员"}
                      </button>
                    </div>
                  </>
                ) : "author" in row ? (
                  <>
                    <div className="admin-row-top">
                      <div className="admin-person">
                        <UserAvatar
                          name={row.author.name}
                          image={row.author.image}
                        />
                        <h3>{row.author.name}</h3>
                      </div>
                      <div className="admin-badges">
                        <span className="admin-badge">
                          {commentLabels[row.status]}
                        </span>
                        <span className="admin-meta">
                          {row.isPublic ? "公开可见" : "未公开展示"}
                        </span>
                      </div>
                    </div>
                    <p className="admin-meta">
                      <time dateTime={row.createdAt}>
                        {auditDate(row.createdAt)}
                      </time>{" "}
                      · {row.parentId ? "回复" : "评论"}
                    </p>
                    <p className="admin-article">
                      {row.article.href ? (
                        <Link href={row.article.href}>{row.article.title}</Link>
                      ) : (
                        row.article.title
                      )}
                    </p>
                    <p className="admin-comment-body">
                      {row.status === "deleted" ? "正文已删除。" : row.body}
                    </p>
                    {row.parentHidden && (
                      <p className="admin-meta">
                        所属评论已隐藏，这条回复也不会公开展示。
                      </p>
                    )}
                    {row.status !== "deleted" && (
                      <div className="admin-row-actions">
                        {row.status === "pending" && (
                          <button
                            className="plain-action"
                            onClick={() => action(row, "comment.approve")}
                          >
                            通过审核
                          </button>
                        )}
                        <button
                          className="plain-action"
                          onClick={() =>
                            action(
                              row,
                              row.status === "hidden"
                                ? "comment.restore"
                                : "comment.hide",
                            )
                          }
                        >
                          {row.status === "hidden" ? "恢复展示" : "隐藏"}
                        </button>
                        <button
                          className="plain-action muted-action"
                          onClick={() => action(row, "comment.delete")}
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="admin-row-top">
                      <h3>
                        {adminActions[row.action as AdminAction] || "管理操作"}
                      </h3>
                      <time className="admin-meta" dateTime={row.createdAt}>
                        {auditDate(row.createdAt)}
                      </time>
                    </div>
                    <p className="admin-target">{row.targetLabel}</p>
                    <p className="admin-meta">
                      {row.actorName} ·{" "}
                      {row.source === "cli" ? "服务器" : "管理中心"}
                    </p>
                    <p className="admin-reason">{row.reason}</p>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {data && (
          <nav className="admin-pagination" aria-label="列表分页">
            <span>
              共 {data.total} 条 · 第 {data.page} / {data.pages} 页
            </span>
            <div>
              <button
                className="plain-action"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                上一页
              </button>
              <button
                className="plain-action"
                disabled={page >= data.pages}
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
              </button>
            </div>
          </nav>
        )}
      </section>
      {target && (
        <Confirmation
          target={target}
          onClose={() => setTarget(null)}
          onDone={(message) => {
            setTarget(null);
            setNotice(message);
            setRevision((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
