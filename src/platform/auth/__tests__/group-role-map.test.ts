import { describe, expect, it } from "vitest";
import { DEMO_IDENTITIES, UNPROVISIONED_DEMO_IDENTITY } from "@/platform/auth/demo-identities";
import { rolesForGroups } from "@/platform/auth/group-role-map";
import { identityFromOidcClaims } from "@/platform/auth/identity";
import { permissionsForRoles } from "@/platform/rbac/permissions";

describe("group-role mapping", () => {
  it("grants nothing for unknown groups", () => {
    expect(rolesForGroups(["contractors", "everyone", "Support", "constructor", "__proto__"])).toEqual([]);
    expect(permissionsForRoles(rolesForGroups(["contractors"]))).toEqual([]);
    expect(rolesForGroups([])).toEqual([]);
  });

  it("maps known groups and ignores unknown ones alongside them", () => {
    expect(rolesForGroups(["support", "contractors"])).toEqual(["support_agent"]);
    expect(rolesForGroups(["auditors", "compliance"])).toEqual(["auditor", "compliance_officer"]);
  });

  it("maps every demo identity to the role in the spec", () => {
    const roles = Object.fromEntries(DEMO_IDENTITIES.map((d) => [d.username, rolesForGroups(d.groups)]));
    expect(roles).toEqual({
      maria: ["support_agent"],
      sam: ["support_agent"],
      olivia: ["ops_analyst"],
      dan: ["finance_approver"],
      priya: ["finance_approver"],
      chris: ["compliance_officer"],
      alex: ["auditor"],
      admin: ["admin"],
    });
    expect(rolesForGroups(UNPROVISIONED_DEMO_IDENTITY.groups)).toEqual([]);
  });

  it("reads groups from the configured OIDC claim", () => {
    expect(identityFromOidcClaims({ sub: "1", email: "a@example.com", roles: ["ops"] }, "roles").groups).toEqual(["ops"]);
    expect(identityFromOidcClaims({ sub: "1", email: "a@example.com" }).groups).toEqual([]);
  });
});
