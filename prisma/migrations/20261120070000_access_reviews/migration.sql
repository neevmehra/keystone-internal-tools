-- CreateTable
CREATE TABLE "AccessReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "startedById" TEXT NOT NULL,
    "startedByName" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedById" TEXT,
    "completedByName" TEXT,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AccessReviewItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "groups" TEXT NOT NULL,
    "roles" TEXT NOT NULL,
    "lastLoginAt" DATETIME,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "decision" TEXT,
    "note" TEXT,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" DATETIME,
    CONSTRAINT "AccessReviewItem_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "AccessReview" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AccessReview_status_startedAt_idx" ON "AccessReview"("status", "startedAt");

-- CreateIndex
CREATE INDEX "AccessReviewItem_reviewId_decision_idx" ON "AccessReviewItem"("reviewId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "AccessReviewItem_reviewId_userId_key" ON "AccessReviewItem"("reviewId", "userId");
