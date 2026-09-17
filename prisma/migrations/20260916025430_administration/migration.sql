-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('PUBLISHED', 'HIDDEN');

-- AlterTable
ALTER TABLE "comment" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "status" "CommentStatus" NOT NULL DEFAULT 'PUBLISHED';

-- CreateTable
CREATE TABLE "adminAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adminAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "adminAudit_createdAt_id_idx" ON "adminAudit"("createdAt", "id");

-- CreateIndex
CREATE INDEX "adminAudit_actorId_createdAt_idx" ON "adminAudit"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "adminAudit_targetType_targetId_idx" ON "adminAudit"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "comment_status_reviewedAt_createdAt_id_idx" ON "comment"("status", "reviewedAt", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "adminAudit" ADD CONSTRAINT "adminAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
