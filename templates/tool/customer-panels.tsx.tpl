/**
 * Optional: how __TOOL_NAME__ shows up on the cross-tool customer page
 * (/customers/[id]) and in global search. Leave the list empty if this tool's
 * records aren't about customers. See src/tools/refunds/customer-panels.tsx
 * for a complete example, and CustomerPanel in src/platform/manifest.ts for
 * the contract. Reads only, and mask every record with maskRecord.
 */
import type { CustomerPanel } from "@/platform/manifest";

export const customerPanels: CustomerPanel[] = [
  // {
  //   tool: "__SLUG__",
  //   title: "__TOOL_NAME__",
  //   stats: async ({ customerId }) => [{ label: "__TOOL_NAME__", value: 0 }],
  //   activity: async ({ customerId }, { take }) => ({ items: [], total: 0 }),
  //   auditEntities: async ({ customerId }) => [{ entityType: "__PASCAL__", entityIds: [] }],
  //   search: async (query, user) => [],
  //   render: async ({ customerId, user }) => <p className="text-sm text-muted-foreground">Nothing yet.</p>,
  // },
];
