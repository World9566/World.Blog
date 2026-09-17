-- CreateTable
CREATE TABLE "comment" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" VARCHAR(2000) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articleLike" (
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "articleLike_pkey" PRIMARY KEY ("userId","articleId")
);

-- CreateTable
CREATE TABLE "bookmark" (
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmark_pkey" PRIMARY KEY ("userId","articleId")
);

-- CreateTable
CREATE TABLE "interactionLimit" (
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "interactionLimit_pkey" PRIMARY KEY ("userId","action")
);

-- CreateIndex
CREATE INDEX "comment_articleId_parentId_createdAt_id_idx" ON "comment"("articleId", "parentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "comment_userId_createdAt_id_idx" ON "comment"("userId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "articleLike_articleId_idx" ON "articleLike"("articleId");

-- CreateIndex
CREATE INDEX "bookmark_userId_createdAt_articleId_idx" ON "bookmark"("userId", "createdAt", "articleId");

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articleLike" ADD CONSTRAINT "articleLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactionLimit" ADD CONSTRAINT "interactionLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
