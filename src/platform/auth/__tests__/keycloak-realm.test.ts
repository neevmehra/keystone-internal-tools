import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_IDENTITIES, UNPROVISIONED_DEMO_IDENTITY } from "../demo-identities";
import { GROUP_ROLE_MAP } from "../group-role-map";

type Realm = {
  groups: { name: string }[];
  users: { username: string; email: string; firstName: string; lastName: string; groups: string[] }[];
  clients: { clientId: string; redirectUris: string[]; protocolMappers: { protocolMapper: string; config: Record<string, string> }[] }[];
};

const realm: Realm = JSON.parse(readFileSync(path.join(process.cwd(), "keycloak/realm-export.json"), "utf8"));

describe("Keycloak demo realm", () => {
  it("has the same users and groups as the demo sign-in", () => {
    const expected = [...DEMO_IDENTITIES, UNPROVISIONED_DEMO_IDENTITY].map((d) => ({
      username: d.username,
      email: d.email,
      name: d.name,
      groups: d.groups.map((g) => `/${g}`),
    }));
    const actual = realm.users.map((u) => ({
      username: u.username,
      email: u.email,
      name: `${u.firstName} ${u.lastName}`,
      groups: u.groups,
    }));
    expect(actual).toEqual(expected);
  });

  it("defines every group the users belong to, and every mapped group", () => {
    const defined = new Set(realm.groups.map((g) => g.name));
    for (const u of realm.users) for (const g of u.groups) expect(defined.has(g.slice(1))).toBe(true);
    for (const g of Object.keys(GROUP_ROLE_MAP)) expect(defined.has(g)).toBe(true);
  });

  it("puts group names (not paths) in a groups claim on the ID token", () => {
    const client = realm.clients.find((c) => c.clientId === "keystone");
    expect(client?.redirectUris).toContain("http://localhost:3000/api/auth/callback/oidc");
    const mapper = client?.protocolMappers.find((m) => m.protocolMapper === "oidc-group-membership-mapper");
    expect(mapper?.config).toMatchObject({ "claim.name": "groups", "full.path": "false", "id.token.claim": "true" });
  });
});
