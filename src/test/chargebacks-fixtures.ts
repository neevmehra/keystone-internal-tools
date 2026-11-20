import { randomUUID } from "node:crypto";
import { db } from "@/platform/db";

/** Test-only fixture insert for the chargebacks tool (fake data). */
export async function makeDispute(
  overrides: Partial<{ status: string; amountCents: number; assignedToId: string | null; assignedToName: string | null; evidenceNote: string | null; respondBy: Date; customerEmail: string }> = {},
) {
  const id = `dsp_test_${randomUUID()}`;
  return db.dispute.create({
    data: {
      id,
      transactionId: `txn_test_${randomUUID()}`,
      customerId: "cus_test_dispute",
      customerEmail: overrides.customerEmail ?? "dana.disputer@example.com",
      amountCents: overrides.amountCents ?? 12_500,
      merchant: "Pixel Electronics",
      cardLast4: "4242",
      network: "visa",
      reasonCode: "not_received",
      status: overrides.status ?? "open",
      assignedToId: overrides.assignedToId ?? null,
      assignedToName: overrides.assignedToName ?? null,
      evidenceNote: overrides.evidenceNote ?? null,
      openedAt: new Date("2026-11-01T00:00:00Z"),
      respondBy: overrides.respondBy ?? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    },
  });
}
