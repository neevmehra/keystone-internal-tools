-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL,
    "approvalRequestId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "paymentRefundId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "executedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Refund_transactionId_key" ON "Refund"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_approvalRequestId_key" ON "Refund"("approvalRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Refund_status_createdAt_idx" ON "Refund"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Refund_customerId_createdAt_idx" ON "Refund"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Refund_createdAt_idx" ON "Refund"("createdAt");

-- CreateIndex
CREATE INDEX "Refund_amountCents_idx" ON "Refund"("amountCents");
