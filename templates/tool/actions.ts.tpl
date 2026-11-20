"use server";

import { z } from "zod";
import { defineAction } from "@/platform/actions";
import { NotFoundError } from "@/platform/errors";

// Every write in this tool is a defineAction export in this file.
// Example: replace with the tool's real actions.
export const setRiskTier = defineAction({
  tool: "__SLUG__",
  name: "__SLUG__.customer.set_risk_tier",
  permission: "__SLUG__:write",
  input: z.object({
    customerId: z.string().min(1),
    riskTier: z.enum(["low", "medium", "high"]),
  }),
  run: async ({ input, tx }) => {
    const before = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!before) throw new NotFoundError("Customer");
    const after = await tx.customer.update({ where: { id: input.customerId }, data: { riskTier: input.riskTier } });
    return {
      entityType: "Customer",
      entityId: after.id,
      before: { riskTier: before.riskTier },
      after: { riskTier: after.riskTier },
      result: { id: after.id, riskTier: after.riskTier },
    };
  },
});
