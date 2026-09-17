import {
  authorizeAccountRequest,
  readAccountBody,
  accountError,
  privateHeaders,
} from "@/lib/account-request";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const authorization = await authorizeAccountRequest(request);
  if (authorization.error) return authorization.error;
  let body: unknown;
  try {
    body = await readAccountBody(request);
  } catch {
    return accountError("请求格式不正确。", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return accountError("请选择要退出的设备。", 400);
  const input = body as Record<string, unknown>;
  const allOthers = Object.keys(input).length === 1 && input.allOthers === true;
  const single =
    Object.keys(input).length === 1 &&
    typeof input.sessionId === "string" &&
    input.sessionId.length > 0 &&
    input.sessionId.length <= 128;
  if (!allOthers && !single) return accountError("请选择要退出的设备。", 400);
  const current = authorization.session;
  if (input.sessionId === current.session.id)
    return accountError("请使用退出登录来退出当前设备。", 400);
  const result = await prisma.session.deleteMany({
    where: {
      userId: current.user.id,
      id: allOthers ? { not: current.session.id } : (input.sessionId as string),
    },
  });
  if (single && !result.count)
    return accountError("该登录已失效，请刷新后查看。", 404);
  return Response.json(
    { message: allOthers ? "其他设备已退出登录。" : "该设备已退出登录。" },
    { headers: privateHeaders },
  );
}
