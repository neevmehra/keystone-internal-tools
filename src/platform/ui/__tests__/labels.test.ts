import { describe, expect, it } from "vitest";
import { actionLabel, fieldLabel, groupLabel, humanize, isTechnicalField, roleLabel, toolLabel } from "../labels";

describe("labels", () => {
  it("names tools from the registry and platform areas", () => {
    expect(toolLabel("refunds")).toBe("Refunds");
    expect(toolLabel("chargebacks")).toBe("Chargebacks");
    expect(toolLabel("build")).toBe("Build with Devin");
    expect(toolLabel("vendor_onboarding")).toBe("Vendor onboarding");
  });

  it("names roles and groups", () => {
    expect(roleLabel("finance_approver")).toBe("Finance approver");
    expect(roleLabel("admin")).toBe("Platform admin");
    expect(groupLabel("finance-approvers")).toBe("Finance approvers");
    expect(groupLabel("new-team")).toBe("New team");
  });

  it("turns audit actions into sentences", () => {
    expect(actionLabel("approval.request")).toBe("Approval requested");
    expect(actionLabel("refund.request")).toBe("Refund requested");
    expect(actionLabel("approval.execute")).toBe("Approval executed");
    expect(actionLabel("auth.sign_in")).toBe("Signed in");
    expect(actionLabel("dispute.mark_lost")).toBe("Dispute marked lost");
    expect(actionLabel("widget.frobnicate")).toBe("Widget frobnicate");
  });

  it("labels fields and flags technical ones", () => {
    expect(fieldLabel("amountCents")).toBe("Amount");
    expect(fieldLabel("decidedAt")).toBe("Decided at");
    expect(isTechnicalField("decidedById")).toBe(true);
    expect(isTechnicalField("attempts")).toBe(true);
    expect(isTechnicalField("status")).toBe(false);
    expect(humanize("customerEmail")).toBe("Customer email");
  });
});
