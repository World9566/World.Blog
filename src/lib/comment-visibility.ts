import "server-only";
import type { Prisma } from "@/generated/prisma/client";

export const publicThread: Prisma.CommentWhereInput = {
  status: "PUBLISHED",
  OR: [{ parentId: null }, { parent: { status: "PUBLISHED" } }],
};
export const publicComment: Prisma.CommentWhereInput = {
  ...publicThread,
  deletedAt: null,
};
