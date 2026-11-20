/**
 * Devin v3 Organization API client (server only).
 *
 *   POST {base}/v3/organizations/{org_id}/sessions   create a session
 *   GET  {base}/v3/organizations/{org_id}/sessions/{id}  read one
 *
 * Auth is a service-user key (Bearer). The key is read from the environment
 * on the server, used only in the Authorization header, and never returned,
 * logged or included in anything the browser receives.
 *
 * Without DEVIN_API_KEY and DEVIN_ORG_ID the request center runs in
 * simulation mode: nothing here is called and no network request is made.
 */
import { KeystoneError } from "@/platform/errors";

export const DEVIN_API_BASE = "https://api.devin.ai";

export type DevinConfig = {
  apiKey: string | null;
  orgId: string | null;
  repo: string | null;
  maxAcu: number | null;
  baseUrl: string;
};

const clean = (v: string | undefined) => {
  const s = v?.trim();
  return s && s !== "replace-me" ? s : null;
};

export function getDevinConfig(env: Record<string, string | undefined> = process.env): DevinConfig {
  const maxAcu = Number(env.DEVIN_MAX_ACU);
  return {
    apiKey: clean(env.DEVIN_API_KEY),
    orgId: clean(env.DEVIN_ORG_ID),
    repo: clean(env.DEVIN_REPO),
    maxAcu: Number.isFinite(maxAcu) && maxAcu > 0 ? maxAcu : null,
    baseUrl: DEVIN_API_BASE,
  };
}

/** Live mode needs both the key and the org. Anything less is simulation. */
export function isLiveMode(cfg: DevinConfig): boolean {
  return !!(cfg.apiKey && cfg.orgId);
}

export type SessionCreateBody = {
  prompt: string;
  title: string;
  tags: string[];
  repos?: string[];
  max_acu_limit?: number;
};

export function buildSessionBody(
  request: { prompt: string; title: string; toolSlug: string | null },
  cfg: Pick<DevinConfig, "repo" | "maxAcu">,
): SessionCreateBody {
  return {
    prompt: request.prompt,
    title: `Keystone request: ${request.title}`.slice(0, 200),
    tags: ["keystone", request.toolSlug ?? "new-tool"],
    ...(cfg.repo && { repos: [cfg.repo] }),
    ...(cfg.maxAcu && { max_acu_limit: cfg.maxAcu }),
  };
}

/** What simulation mode shows instead of calling the API. Never contains the key. */
export function simulatedRequest(cfg: Pick<DevinConfig, "orgId" | "baseUrl">, body: SessionCreateBody) {
  return {
    method: "POST",
    url: `${cfg.baseUrl}/v3/organizations/${cfg.orgId ?? "<DEVIN_ORG_ID>"}/sessions`,
    headers: { Authorization: "Bearer <DEVIN_API_KEY>", "Content-Type": "application/json" },
    body,
  };
}

export type SessionInfo = {
  id: string | null;
  url: string | null;
  status: string | null;
  pullRequest: { url: string; state: string | null } | null;
  acus: number | null;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Parse a session response defensively: field names differ between API
 * versions, so look in the likely places and fall back to null.
 */
export function parseSession(json: unknown): SessionInfo {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const id = str(o.session_id) ?? str(o.devin_id) ?? str(o.id);
  const prs = Array.isArray(o.pull_requests) ? o.pull_requests : o.pull_request ? [o.pull_request] : [];
  const pr = prs
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
    .map((p) => ({ url: str(p.pr_url) ?? str(p.url), state: str(p.pr_state) ?? str(p.state) }))
    .filter((p): p is { url: string; state: string | null } => !!p.url)
    .at(-1);
  const consumption = o.consumption && typeof o.consumption === "object" ? (o.consumption as Record<string, unknown>) : {};
  return {
    id,
    url: str(o.url) ?? (id ? `https://app.devin.ai/sessions/${id.replace(/^devin-/, "")}` : null),
    status: str(o.status_enum) ?? str(o.status),
    pullRequest: pr ? { url: pr.url, state: pr.state?.toLowerCase() ?? null } : null,
    acus: num(o.acus_consumed) ?? num(o.acu_used) ?? num(o.acus) ?? num(consumption.acus),
  };
}

export interface DevinClient {
  createSession(body: SessionCreateBody): Promise<SessionInfo>;
  getSession(id: string): Promise<SessionInfo>;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export class HttpDevinClient implements DevinClient {
  constructor(
    private readonly cfg: DevinConfig,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {
    if (!isLiveMode(cfg)) throw new KeystoneError("INTEGRATION_ERROR", "Devin API is not configured (simulation mode).");
  }

  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<SessionInfo> {
    const url = `${this.cfg.baseUrl}/v3/organizations/${encodeURIComponent(this.cfg.orgId!)}${path}`;
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: { Authorization: `Bearer ${this.cfg.apiKey}`, "Content-Type": "application/json" },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch {
      throw new KeystoneError("INTEGRATION_ERROR", "Couldn't reach the Devin API.");
    }
    if (!res.ok) throw new KeystoneError("INTEGRATION_ERROR", `Devin API returned HTTP ${res.status}.`);
    return parseSession(await res.json().catch(() => ({})));
  }

  createSession(body: SessionCreateBody) {
    return this.call("POST", "/sessions", body);
  }

  getSession(id: string) {
    return this.call("GET", `/sessions/${encodeURIComponent(id)}`);
  }
}

let testClient: DevinClient | null = null;

/** Tests only: swap in a fake client. */
export function setDevinClientForTests(client: DevinClient | null) {
  testClient = client;
}

export function getDevinClient(cfg: DevinConfig = getDevinConfig()): DevinClient {
  return testClient ?? new HttpDevinClient(cfg);
}
