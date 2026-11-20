import type { Identity } from "./types";

/** Map OIDC claims to an Identity. The groups claim name is configurable. */
export function identityFromOidcClaims(
  claims: Record<string, unknown>,
  groupsClaim = process.env.OIDC_GROUPS_CLAIM || "groups",
): Identity {
  const rawGroups = claims[groupsClaim];
  const groups = Array.isArray(rawGroups)
    ? rawGroups.map(String)
    : typeof rawGroups === "string"
      ? rawGroups.split(/[\s,]+/).filter(Boolean)
      : [];
  const email = String(claims.email ?? claims.preferred_username ?? claims.upn ?? "");
  return {
    subject: `oidc|${String(claims.sub ?? "")}`,
    name: String(claims.name ?? email),
    email,
    groups,
  };
}
