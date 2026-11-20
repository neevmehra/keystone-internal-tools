/**
 * Customer panels registry (server only). Each tool that shows up on the
 * cross-tool customer page and in global search exports `customerPanels`
 * from src/tools/<slug>/customer-panels.tsx and is listed here.
 * `npm run new-tool` edits this file.
 */
import type { CustomerPanel } from "@/platform/manifest";
import { customerPanels as refundsCustomerPanels } from "./refunds/customer-panels";
import { customerPanels as chargebacksCustomerPanels } from "./chargebacks/customer-panels";
// keystone:customer-panel-imports

export const customerPanels: readonly CustomerPanel[] = [
  ...refundsCustomerPanels,
  ...chargebacksCustomerPanels,
  // keystone:customer-panel-entries
];
