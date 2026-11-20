import type { ToolManifest } from "@/platform/manifest";

export const manifest = {
  slug: "__SLUG__",
  name: "__TOOL_NAME__",
  description: "TODO: one sentence on what __TOOL_NAME__ is for",
  icon: "LayoutList",
  ownerTeam: "TODO: owning team",
  sensitivity: "pii",
  readPermission: "__SLUG__:read",
  piiFields: ["name", "email", "phone"],
  nav: [{ label: "Queue", href: "/tools/__SLUG__" }],
} satisfies ToolManifest;
