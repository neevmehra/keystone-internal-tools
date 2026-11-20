import { describe, expect, it } from "vitest";
import { eventTitle, formatAuditValue, readableChanges } from "../audit-format";

describe("audit formatting", () => {
  it("titles events in plain words, including three-part action names", () => {
    expect(eventTitle("approval.request")).toBe("Sent for approval");
    expect(eventTitle("approval.approve")).toBe("Approved");
    expect(eventTitle("refund.request")).toBe("Refund requested");
    expect(eventTitle("chargebacks.dispute.pick_up")).toBe("Picked up");
    expect(eventTitle("build.request.submit")).toBe("Build request submitted");
    expect(eventTitle("widget.frobnicate")).toBe("Widget frobnicate");
  });

  it("formats money, statuses, booleans and dates", () => {
    expect(formatAuditValue("amountCents", 25000)).toBe("$250.00");
    expect(formatAuditValue("status", "pending_approval")).toBe("Pending approval");
    expect(formatAuditValue("requiresApproval", true)).toBe("Yes");
    expect(formatAuditValue("decidedAt", "2026-11-19T15:30:00.000Z")).toMatch(/^Nov 19, 2026, 3:30\sPM UTC$/);
    expect(formatAuditValue("reason", null)).toBeNull();
  });

  it("hides technical fields and recognizes new records", () => {
    const created = readableChanges([
      { field: "amountCents", before: undefined, after: 25000 },
      { field: "attempts", before: undefined, after: 0 },
      { field: "decidedById", before: undefined, after: null },
      { field: "status", before: undefined, after: "pending" },
    ]);
    expect(created.created).toBe(true);
    expect(created.readable.map((c) => c.label)).toEqual(["Amount", "Status"]);
    expect(created.technical.map((c) => c.field)).toEqual(["attempts", "decidedById"]);
    expect(created.readable[1]).toMatchObject({ status: true, rawAfter: "pending", after: "Pending" });

    const changed = readableChanges([{ field: "status", before: "pending", after: "approved" }]);
    expect(changed.created).toBe(false);
    expect(changed.readable[0]).toMatchObject({ before: "Pending", after: "Approved" });
  });
});
