/**
 * Tool registry: imports every tool's manifest. The sidebar, portal home and
 * admin catalog all read from here. `npm run new-tool` edits this file.
 */
import type { ToolManifest } from "@/platform/manifest";
// keystone:tool-imports

export const tools: readonly ToolManifest[] = [
  // keystone:tool-entries
];
