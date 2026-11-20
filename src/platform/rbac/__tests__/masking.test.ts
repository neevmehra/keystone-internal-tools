import { describe, expect, it } from "vitest";
import { maskAuditEvent } from "@/platform/audit/masking";
import { hasPermission, maskRecord, maskRecords, requirePermission } from "@/platform/rbac";
import { PermissionDeniedError } from "@/platform/errors";
import { makeUser } from "@/test/fixtures";

const record = { id: "cus_1", customerEmail: "maria.lopez@example.com", cardNumber: "4242 4242 4242 4242", name: "Maria Lopez", amountCents: 1200 };
const fields = ["customerEmail", "cardNumber", "name"];

describe("maskRecord", () => {
  it("hides PII from users without pii:read", () => {
    const alex = makeUser({ roles: ["auditor"] });
    expect(maskRecord(record, fields, alex)).toEqual({
      id: "cus_1",
      customerEmail: "m•••@example.com",
      cardNumber: "•••• 4242",
      name: "M••• L•••",
      amountCents: 1200,
    });
    expect(maskRecord(record, fields, null).customerEmail).toBe("m•••@example.com");
  });

  it("shows PII to users with pii:read", () => {
    const chris = makeUser({ roles: ["compliance_officer"] });
    expect(maskRecord(record, fields, chris)).toEqual(record);
  });

  it("never mutates the input and masks lists", () => {
    const masked = maskRecords([record], fields, makeUser());
    expect(masked[0].customerEmail).not.toBe(record.customerEmail);
    expect(record.customerEmail).toBe("maria.lopez@example.com");
  });

  it("masks PII inside audit snapshots", () => {
    const event = {
      id: "e1", createdAt: new Date(), actorId: "u", actorName: "U", actorRoles: [], tool: "platform", action: "auth.sign_in",
      entityType: "User", entityId: "u", requestId: null,
      before: null, after: { email: "alex@example.com", roles: ["auditor"] },
    };
    expect(maskAuditEvent(event, makeUser({ roles: ["auditor"] })).after).toEqual({ email: "a•••@example.com", roles: ["auditor"] });
  });
});

describe("requirePermission", () => {
  it("throws a typed error", () => {
    const maria = makeUser({ roles: ["support_agent"] });
    expect(hasPermission(maria, "requests:create")).toBe(true);
    expect(() => requirePermission(maria, "audit:read")).toThrow(PermissionDeniedError);
  });
});
