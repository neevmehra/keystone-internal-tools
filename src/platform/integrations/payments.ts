import { createHash } from "node:crypto";

export type RefundInput = { transactionId: string; amountCents: number; idempotencyKey: string };
export type RefundResult = {
  refundId: string;
  transactionId: string;
  amountCents: number;
  status: "succeeded";
  idempotencyKey: string;
};

export interface PaymentsClient {
  refund(input: RefundInput): Promise<RefundResult>;
}

export class PaymentsError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PaymentsError";
  }
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function envFailRate(): number {
  const rate = Number(process.env.FAKE_PAYMENTS_FAIL_RATE ?? 0);
  return Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 1) : 0;
}

/**
 * Deterministic fake for local dev and tests. Records every call, returns the
 * same result for a repeated idempotency key, and fails (retryably) at
 * FAKE_PAYMENTS_FAIL_RATE. Failures aren't cached, so a retry with the same
 * key can succeed, and a success is never repeated.
 */
export class FakePaymentsClient implements PaymentsClient {
  readonly calls: RefundInput[] = [];
  private readonly results = new Map<string, RefundResult>();
  private readonly random: () => number;
  private readonly failRate: number;

  constructor(opts: { failRate?: number; seed?: number } = {}) {
    this.failRate = opts.failRate ?? envFailRate();
    this.random = mulberry32(opts.seed ?? 42);
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    this.calls.push({ ...input });
    if (!input.idempotencyKey) throw new PaymentsError("idempotencyKey is required", false);
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new PaymentsError("amountCents must be a positive integer", false);
    }
    const previous = this.results.get(input.idempotencyKey);
    if (previous) {
      if (previous.transactionId !== input.transactionId || previous.amountCents !== input.amountCents) {
        throw new PaymentsError("idempotencyKey reused with different parameters", false);
      }
      return previous;
    }
    if (this.random() < this.failRate) throw new PaymentsError("Fake payments provider failure", true);
    const hash = createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 16);
    const result: RefundResult = { ...input, refundId: `re_${hash}`, status: "succeeded" };
    this.results.set(input.idempotencyKey, result);
    return result;
  }

  /** Number of distinct refunds that actually succeeded. */
  get executedCount(): number {
    return this.results.size;
  }
}

const globalForPayments = globalThis as unknown as { keystonePayments?: PaymentsClient };

/** The app's payments client. Swap in a real implementation for production. */
export function getPaymentsClient(): PaymentsClient {
  globalForPayments.keystonePayments ??= new FakePaymentsClient();
  return globalForPayments.keystonePayments;
}
