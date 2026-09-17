import {
  requireAdminRequest,
  listAdminUsers,
  listAdminComments,
  listAdminAudit,
} from "@/lib/admin";
import { parseAdminQuery } from "@/lib/admin-policy";
import { communityResponse, communityJson } from "@/lib/community";
import { accountError } from "@/lib/account-request";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ section: string }> },
) {
  return communityResponse(async () => {
    const auth = await requireAdminRequest(request);
    if (auth.error) return auth.error;
    const { section } = await context.params;
    if (section === "overview") {
      const [users, pending, hidden] = await prisma.$transaction([
        prisma.user.count(),
        prisma.comment.count({
          where: { deletedAt: null, status: "PUBLISHED", reviewedAt: null },
        }),
        prisma.comment.count({ where: { deletedAt: null, status: "HIDDEN" } }),
      ]);
      return communityJson({ users, pending, hidden });
    }
    if (section !== "users" && section !== "comments" && section !== "audit")
      return accountError("页面不存在。", 404);
    const query = parseAdminQuery(new URL(request.url).searchParams, section);
    if (!query) return accountError("搜索条件或页码不正确。", 400);
    return communityJson(
      section === "users"
        ? await listAdminUsers(query, auth.session!.user.id)
        : section === "comments"
          ? await listAdminComments(query)
          : await listAdminAudit(query),
    );
  });
}
