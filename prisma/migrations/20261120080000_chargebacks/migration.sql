-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "merchant" TEXT NOT NULL,
    "cardLast4" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assignedToId" TEXT,
    "assignedToName" TEXT,
    "assignedAt" DATETIME,
    "evidenceNote" TEXT,
    "evidenceAt" DATETIME,
    "openedAt" DATETIME NOT NULL,
    "respondBy" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "writtenOffAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Dispute_status_respondBy_idx" ON "Dispute"("status", "respondBy");

-- CreateIndex
CREATE INDEX "Dispute_customerId_idx" ON "Dispute"("customerId");

-- CreateIndex
CREATE INDEX "Dispute_transactionId_idx" ON "Dispute"("transactionId");

-- CreateIndex
CREATE INDEX "Dispute_resolvedAt_idx" ON "Dispute"("resolvedAt");
