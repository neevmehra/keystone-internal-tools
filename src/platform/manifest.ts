import type { Permission } from "@/platform/rbac/permissions";

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
