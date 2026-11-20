import { describe, expect, it } from "vitest";
import { accessMatrix, accessMatrixRows, groupsForRole, toolAccess } from "@/platform/admin";
import { GROUP_ROLE_MAP } from "@/platform/auth/group-role-map";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from "@/platform/rbac/permissions";
import { recordHref, historyHref } from "@/platform/audit/links";
import { csvCell, toCsv } from "@/platform/csv";

describe("access matrix", () => {
  it("matches permissions.ts exactly", () => {
    const m = accessMatrix();
    expect(m.roles).toEqual(ROLES);
    expect(m.permissions).toEqual(PERMISSIONS);
    for (const role of ROLES) expect([...m.grants[role]].sort()).toEqual([...ROLE_PERMISSIONS[role]].sort());

    const { header, rows } = accessMatrixRows();
    expect(header).toEqual(["role", ...PERMISSIONS]);
    for (const row of rows) {
      const role = row[0] as (typeof ROLES)[number];
      PERMISSIONS.forEach((p, i) => expect(row[i + 1]).toBe((ROLE_PERMISSIONS[role] as readonly string[]).includes(p) ? "Y" : ""));
    }
  });

  it("keeps platform admins away from customer PII (least privilege)", () => {
    expect(ROLE_PERMISSIONS.admin).not.toContain("pii:read");
    expect(ROLE_PERMISSIONS.admin).toEqual(expect.arrayContaining(["admin:read", "audit:export", "access_reviews:manage"]));
    expect(ROLE_PERMISSIONS.auditor).toEqual(expect.arrayContaining(["audit:read", "audit:export"]));
    expect(ROLE_PERMISSIONS.auditor).not.toContain("pii:read");
  });

  it("derives groups for a role from the IdP mapping", () => {
    for (const [group, role] of Object.entries(GROUP_ROLE_MAP)) expect(groupsForRole(role)).toContain(group);
  });

  it("derives tool access from permission strings", () => {
    const access = toolAccess({ slug: "nope", readPermission: "audit:read" });
    expect(access.read.sort()).toEqual(ROLES.filter((r) => (ROLE_PERMISSIONS[r] as readonly string[]).includes("audit:read")).sort());
    expect(access.write).toEqual([]);
    expect(access.approve).toEqual([]);
  });
});

describe("audit record links", () => {
  const base = { tool: "platform", before: null, after: null };
  it("links platform records to their pages", () => {
    expect(recordHref({ ...base, entityType: "AccessReview", entityId: "r1" })).toBe("/admin/access-reviews/r1");
    expect(recordHref({ ...base, entityType: "AccessReviewItem", entityId: "i1", after: { reviewId: "r9" } })).toBe("/admin/access-reviews/r9");
    expect(recordHref({ ...base, entityType: "User", entityId: "u1" })).toBe("/admin/access");
    expect(recordHref({ ...base, entityType: "EvidencePack", entityId: "e1" })).toBeNull();
    expect(recordHref({ ...base, tool: "not-a-registered-tool", entityType: "Thing", entityId: "x" })).toBeNull();
  });
  it("links to a record's full history", () => {
    expect(historyHref({ entityType: "Refund", entityId: "ref_1" })).toBe("/audit?entityType=Refund&entityId=ref_1");
  });
});

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell(null)).toBe("");
    expect(toCsv(["x", "y"], [[1, { a: 1 }]])).toBe('x,y\n1,"{""a"":1}"\n');
  });
});
