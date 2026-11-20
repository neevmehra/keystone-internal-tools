import type { ReactNode } from "react";
import type { CurrentUser } from "@/platform/auth/types";
import type { Permission } from "@/platform/rbac/permissions";
import type { StatCard } from "@/platform/ui/StatCards";

export type ToolSensitivity = "internal" | "pii" | "money";

export type ToolManifest = {
  slug: string;
  name: string;
  description: string;
  /** lucide icon name, e.g. "ReceiptText" */
  icon: string;
  ownerTeam: string;
  sensitivity: ToolSensitivity;
  readPermission: Permission;
  piiFields?: readonly string[];
  nav: ReadonlyArray<{ label: string; href: string }>;
  /** Per-tool approval threshold for money actions, in cents. */
  approvalThresholdCents?: number;
};

/*
 * Customer panels: how a tool contributes to the cross-tool customer page
 * (/customers/[id]) and to global search. A tool exports `customerPanels`
 * from src/tools/<slug>/customer-panels.tsx and is listed in
 * src/tools/customer-panels.ts (the scaffold does both). Panels live outside
 * the manifest object because they read the database, and manifests are
 * plain data imported all over the app.
 *
 * Every function receives the signed-in user and must return masked data
 * (maskRecord). The platform only calls a tool's panel for users who hold the
 * tool's readPermission.
 */
export type CustomerPanelContext = { customerId: string; user: CurrentUser };

/** One entry in a customer's merged activity timeline. */
export type CustomerActivity = {
  /** Unique across all sources, e.g. "refunds:ref_123". */
  id: string;
  at: Date;
  /** Tool slug, or "platform". */
  tool: string;
  /** Short label, e.g. "Refund requested". */
  kind: string;
  title: string;
  detail?: string;
  amountCents?: number;
  status?: string;
  href?: string;
};

/** A record found by ID in global search. */
export type CustomerSearchResult = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  href: string;
  customerId?: string;
};

export type CustomerPanel = {
  /** The tool's slug; the panel renders only for users with its readPermission. */
  tool: string;
  title: string;
  /** Headline numbers for the customer page's StatCards. */
  stats?: (ctx: CustomerPanelContext) => Promise<StatCard[]>;
  /** The customer's records as timeline entries: the newest `take`, plus the total count. */
  activity?: (ctx: CustomerPanelContext, page: { take: number }) => Promise<{ items: CustomerActivity[]; total: number }>;
  /** Records this tool owns for the customer, so their audit history joins the timeline. */
  auditEntities?: (ctx: CustomerPanelContext) => Promise<Array<{ entityType: string; entityIds: string[] }>>;
  /** Records whose ID starts with `query` (e.g. "ref_", "dsp_"). */
  search?: (query: string, user: CurrentUser) => Promise<CustomerSearchResult[]>;
  /** The panel body, a server component. */
  render: (ctx: CustomerPanelContext) => Promise<ReactNode>;
};
