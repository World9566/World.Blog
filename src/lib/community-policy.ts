export const COMMENT_LIMIT = 2000;
export const COMMENT_PAGE_SIZE = 10;
export const ACTIVITY_PAGE_SIZE = 6;

export const isCommentId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);

export function parseComment(
  value: unknown,
):
  | { ok: true; body: string; parentId: string | null; requestId: string }
  | { ok: false; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ok: false, message: "请填写评论内容。" };
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !["body", "parentId", "requestId"].includes(key),
    ) ||
    typeof input.body !== "string" ||
    !isCommentId(input.requestId) ||
    (input.parentId !== undefined &&
      input.parentId !== null &&
      !isCommentId(input.parentId))
  )
    return { ok: false, message: "评论格式不正确，请刷新后重试。" };
  const body = input.body.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  if (
    !body ||
    body.length > COMMENT_LIMIT ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)
  )
    return {
      ok: false,
      message: "评论需要 1 到 2000 个字符，请移除无效字符。",
    };
  return {
    ok: true,
    body,
    parentId: (input.parentId as string | null) || null,
    requestId: input.requestId,
  };
}

export function parseReaction(
  value: unknown,
): { kind: "like" | "bookmark"; active: boolean } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== 2 ||
    !["like", "bookmark"].includes(String(input.kind)) ||
    typeof input.active !== "boolean"
  )
    return null;
  return { kind: input.kind as "like" | "bookmark", active: input.active };
}

export type CommentView = {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  deleted: boolean;
  mine: boolean;
  author: { name: string; image: string | null } | null;
  replyCount: number;
};
export type CommentPage = { items: CommentView[]; nextCursor: string | null };
export type InteractionState = {
  likes: number;
  comments: number;
  liked: boolean;
  bookmarked: boolean;
};
export type ActivityPage = {
  items: {
    id: string;
    title: string;
    href: string;
    createdAt: string;
    body?: string;
    articleId: string;
  }[];
  nextPage: number | null;
};
