import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "./config";

/** Signed session cookie for AUTH_MODE=mock. The cookie itself is httpOnly. */
export const MOCK_SESSION_COOKIE = "keystone_session";
export const MOCK_SESSION_MAX_AGE = 60 * 60 * 8;

type Payload = { uid: string; exp: number };

function sign(data: string): string {
  return createHmac("sha256", getAuthSecret()).update(data).digest("base64url");
}

export function createSessionToken(userId: string, now = Date.now()): string {
  const payload: Payload = { uid: userId, exp: Math.floor(now / 1000) + MOCK_SESSION_MAX_AGE };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as Payload;
    if (typeof payload.uid !== "string" || payload.exp * 1000 < now) return null;
    return payload.uid;
  } catch {
    return null;
  }
}
