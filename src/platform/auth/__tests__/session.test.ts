import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthMode } from "@/platform/auth/config";
import { createSessionToken, verifySessionToken } from "@/platform/auth/mock-session";

describe("mock session", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips a signed token and rejects tampering or expiry", () => {
    const token = createSessionToken("usr_1");
    expect(verifySessionToken(token)).toBe("usr_1");
    const [data, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "usr_admin", exp: 9e9 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${sig}`)).toBeNull();
    expect(verifySessionToken(`${data}.x${sig.slice(1)}`)).toBeNull();
    expect(verifySessionToken(token, Date.now() + 9 * 60 * 60 * 1000)).toBeNull();
  });

  it("refuses mock mode when NODE_ENV=production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_MODE", "mock");
    expect(() => getAuthMode()).toThrow(/refuses to run/);
    vi.stubEnv("AUTH_MODE", "oidc");
    expect(getAuthMode()).toBe("oidc");
  });
});
