import { describe, expect, it } from "vitest";
import { FakePaymentsClient, PaymentsError } from "@/platform/integrations";

describe("FakePaymentsClient", () => {
  it("records calls and returns the same result for a repeated idempotency key", async () => {
    const client = new FakePaymentsClient({ failRate: 0 });
    const input = { transactionId: "txn_1", amountCents: 500, idempotencyKey: "key-1" };
    const a = await client.refund(input);
    const b = await client.refund(input);
    expect(b).toEqual(a);
    expect(client.calls).toHaveLength(2);
    expect(client.executedCount).toBe(1);
    await expect(client.refund({ ...input, amountCents: 900 })).rejects.toThrow(/different parameters/);
  });

  it("fails at the configured rate, deterministically", async () => {
    const always = new FakePaymentsClient({ failRate: 1 });
    await expect(always.refund({ transactionId: "t", amountCents: 1, idempotencyKey: "k" })).rejects.toBeInstanceOf(PaymentsError);
    const outcomes = async () => {
      const c = new FakePaymentsClient({ failRate: 0.5, seed: 7 });
      const r: boolean[] = [];
      for (let i = 0; i < 20; i++) r.push(await c.refund({ transactionId: "t", amountCents: 1, idempotencyKey: `k${i}` }).then(() => true, () => false));
      return r;
    };
    expect(await outcomes()).toEqual(await outcomes());
  });

  it("rejects non-integer cents", async () => {
    await expect(new FakePaymentsClient({ failRate: 0 }).refund({ transactionId: "t", amountCents: 1.5, idempotencyKey: "k" })).rejects.toThrow(/integer/);
  });
});
