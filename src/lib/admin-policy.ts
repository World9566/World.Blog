export const ADMIN_PAGE_SIZE = 10;
export const adminActions = {
  "user.ban": "停用用户",
  "user.unban": "恢复用户",
  "user.promote": "设为管理员",
  "user.demote": "设为普通用户",
  "comment.approve": "通过评论",
  "comment.hide": "隐藏评论",
  "comment.restore": "恢复评论",
  "comment.delete": "删除评论",
} as const;
export type AdminAction = keyof typeof adminActions;

export function parseAdminAction(
  value: unknown,
  type: "user" | "comment",
):
  | { ok: true; action: AdminAction; reason: string }
  | { ok: false; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ok: false, message: "请选择操作并填写原因。" };
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== 2 ||
    typeof input.action !== "string" ||
    !Object.hasOwn(adminActions, input.action) ||
    !input.action.startsWith(`${type}.`) ||
    typeof input.reason !== "string"
  )
    return { ok: false, message: "操作格式不正确。" };
  const reason = input.reason.normalize("NFC").trim();
  if (
    reason.length < 2 ||
    reason.length > 500 ||
    /[\u0000-\u001f\u007f]/.test(reason)
  )
    return {
      ok: false,
      message: "请填写 2 到 500 个字符的操作原因，且不能包含换行。",
    };
  return { ok: true, action: input.action as AdminAction, reason };
}

export type AdminQuery = { page: number; q: string; status: string };
export function parseAdminQuery(
  params: URLSearchParams,
  section: "users" | "comments" | "audit",
): AdminQuery | null {
  const page = params.get("page") || "1";
  const q = (params.get("q") || "").trim();
  const status = params.get("status") || "all";
  const options =
    section === "users"
      ? ["all", "active", "banned", "admin"]
      : section === "comments"
        ? ["all", "pending", "published", "hidden", "deleted"]
        : ["all", "user", "comment"];
  if (
    !/^[1-9]\d{0,3}$/.test(page) ||
    q.length > 100 ||
    /[\u0000-\u001f\u007f]/.test(q) ||
    !options.includes(status)
  )
    return null;
  return { page: Number(page), q, status };
}

export type AdminUser = {
  id: string;
  name: string;
  image: string | null;
  githubUsername: string | null;
  githubId: string | null;
  role: string;
  banned: boolean;
  banReason: string | null;
  createdAt: string;
  comments: number;
  self: boolean;
};
export type AdminComment = {
  id: string;
  body: string;
  author: { name: string; image: string | null };
  article: { title: string; href: string | null };
  status: "pending" | "published" | "hidden" | "deleted";
  isPublic: boolean;
  parentHidden: boolean;
  parentId: string | null;
  createdAt: string;
};
export type AuditView = {
  id: string;
  actorName: string;
  source: string;
  action: string;
  targetLabel: string;
  reason: string;
  createdAt: string;
};
export type AdminPage<T> = {
  items: T[];
  page: number;
  total: number;
  pages: number;
};
