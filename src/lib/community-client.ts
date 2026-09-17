"use client";

export class CommunityRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function communityFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new CommunityRequestError("连接未成功，请稍后重试。", 0);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result)
    throw new CommunityRequestError(
      result?.message || "暂时无法加载，请稍后重试。",
      response.status,
    );
  return result as T;
}
export const jsonMutation = (method: string, value: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});
export const communityDate = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
