import "server-only";
import { authOrigin } from "./auth-config";
import { readSession } from "./session";

export const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
export const accountError = (message: string, status: number) =>
  Response.json({ message }, { status, headers: privateHeaders });

export async function authorizeAccountRequest(request: Request) {
  if (
    request.headers.get("origin") !== authOrigin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return { error: accountError("请求来源无效，请刷新页面后重试。", 403) };
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return { error: accountError("请求格式不正确。", 415) };
  const session = await readSession(request.headers);
  if (!session) return { error: accountError("登录已失效，请重新登录。", 401) };
  return { session };
}

export async function readAccountBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") || 0) > 8192)
    throw new Error("Body too large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Body is required");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 8192) {
      await reader.cancel();
      throw new Error("Body too large");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
