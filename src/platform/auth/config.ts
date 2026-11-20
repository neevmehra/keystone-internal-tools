export type AuthMode = "mock" | "oidc";

export function getAuthMode(): AuthMode {
  const mode = (process.env.AUTH_MODE ?? "mock").toLowerCase();
  if (mode !== "mock" && mode !== "oidc") throw new Error(`Unknown AUTH_MODE "${mode}". Use "mock" or "oidc".`);
  if (mode === "mock" && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_MODE=mock refuses to run when NODE_ENV=production. Configure AUTH_MODE=oidc.");
  }
  return mode;
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET must be set (at least 16 characters).");
  return secret;
}
