/**
 * Tool registry: imports every tool's manifest. The sidebar, portal home and
 * admin catalog all read from here. `npm run new-tool` edits this file.
 */
import type { ToolManifest } from "@/platform/manifest";
import { manifest as refundsManifest } from "./refunds/manifest";
import { manifest as chargebacksManifest } from "./chargebacks/manifest";
// keystone:tool-imports

export const tools: readonly ToolManifest[] = [
  refundsManifest,
  chargebacksManifest,
  // keystone:tool-entries
];
