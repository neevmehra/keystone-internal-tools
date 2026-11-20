import type { ToolManifest } from "@/platform/manifest";

export const manifest = {
  slug: "chargebacks",
  name: "Chargebacks",
  description: "Work open card disputes before their deadline, record evidence, and track wins, losses and write-offs",
  icon: "ShieldAlert",
  ownerTeam: "Payments Ops",
  sensitivity: "money",
  readPermission: "chargebacks:read",
  piiFields: ["customerEmail"],
  nav: [{ label: "Disputes", href: "/tools/chargebacks" }],
  // Write-offs over $500.00 need finance sign-off. The approvals engine treats
  // amounts at or above the threshold as needing approval, so $500.01.
  approvalThresholdCents: 50_001,
} satisfies ToolManifest;
