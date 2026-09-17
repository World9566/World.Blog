import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { db } from "./db";

const globalPrisma = globalThis as unknown as { blogPrisma?: PrismaClient };
export const prisma =
  globalPrisma.blogPrisma ?? new PrismaClient({ adapter: new PrismaPg(db) });
if (process.env.NODE_ENV !== "production") globalPrisma.blogPrisma = prisma;
