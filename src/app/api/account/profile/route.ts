import {
  authorizeAccountRequest,
  readAccountBody,
  accountError,
  privateHeaders,
} from "@/lib/account-request";
import { parseProfile } from "@/lib/account-policy";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export async function PATCH(request: Request) {
  const authorization = await authorizeAccountRequest(request);
  if (authorization.error) return authorization.error;
  let input: unknown;
  try {
    input = await readAccountBody(request);
  } catch {
    return accountError("资料格式不正确或内容过长。", 400);
  }
  const parsed = parseProfile(input);
  if (!parsed.ok) return accountError(parsed.message, 400);
  const changed = await prisma.user.updateMany({
    where: { id: authorization.session.user.id, banned: false },
    data: parsed.data,
  });
  if (!changed.count) return accountError("账号状态已变化，请重新登录。", 403);
  return Response.json(
    { message: "个人资料已保存。", profile: parsed.data },
    { headers: privateHeaders },
  );
}
