import "dotenv/config";
import { parseArgs } from "node:util";
import { prisma } from "../src/lib/prisma";
import { db } from "../src/lib/db";
import { changeUserAccess } from "../src/lib/admin";
import type { AdminAction } from "../src/lib/admin-policy";

async function main() {
  const { values } = parseArgs({
    options: {
      "github-id": { type: "string" },
      role: { type: "string" },
      ban: { type: "boolean" },
      unban: { type: "boolean" },
      reason: { type: "string" },
    },
    strict: true,
  });
  const id = values["github-id"];
  if (
    !id ||
    !/^\d+$/.test(id) ||
    [!!values.role, !!values.ban, !!values.unban].filter(Boolean).length !==
      1 ||
    (values.role && !["user", "admin"].includes(values.role))
  ) {
    throw new Error(
      "Usage: pnpm user:access --github-id <numeric GitHub ID> (--role admin|user | --ban | --unban) [--reason <reason>]",
    );
  }
  const account = await prisma.account.findUnique({
    where: { providerId_accountId: { providerId: "github", accountId: id } },
    include: { user: true },
  });
  if (!account)
    throw new Error(
      "No registered GitHub account with this ID. Sign in to the blog first.",
    );
  const action: AdminAction = values.role
    ? values.role === "admin"
      ? "user.promote"
      : "user.demote"
    : values.ban
      ? "user.ban"
      : "user.unban";
  const reason = values.reason?.trim() || "通过服务器命令维护账号权限";
  if (
    reason.length < 2 ||
    reason.length > 500 ||
    /[\u0000-\u001f\u007f]/.test(reason)
  )
    throw new Error(
      "Reason must contain 2-500 characters without control characters.",
    );
  const result = await changeUserAccess(null, account.userId, action, reason);
  console.log(`${account.user.name} (GitHub ID ${id}): ${result.message}`);
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await db.end();
  });
