-- CreateTable
CREATE TABLE "ToolRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "toolSlug" TEXT,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "audienceGroups" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "signOff" TEXT,
    "signOffAboveCents" INTEGER,
    "involvesPii" BOOLEAN NOT NULL DEFAULT false,
    "movesMoney" BOOLEAN NOT NULL DEFAULT false,
    "peopleCount" INTEGER,
    "hoursPerWeek" REAL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "mode" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "approvalRequestId" TEXT,
    "devinSessionId" TEXT,
    "devinSessionUrl" TEXT,
    "devinStatus" TEXT,
    "simulatedPayload" TEXT,
    "prUrl" TEXT,
    "prState" TEXT,
    "acusUsed" REAL,
    "launchedAt" DATETIME,
    "lastSyncedAt" DATETIME,
    "shippedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ToolRequest_approvalRequestId_key" ON "ToolRequest"("approvalRequestId");

-- CreateIndex
CREATE INDEX "ToolRequest_requestedById_createdAt_idx" ON "ToolRequest"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "ToolRequest_status_createdAt_idx" ON "ToolRequest"("status", "createdAt");
