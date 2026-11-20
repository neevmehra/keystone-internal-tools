import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PLATFORM_ROUTES } from "@/platform/ui/nav-config";

describe("platform nav slots", () => {
  it("render only once their route exists", () => {
    for (const slot of Object.values(PLATFORM_ROUTES)) {
      const page = path.resolve(__dirname, "../../../app/(app)", `.${slot.href}`, "page.tsx");
      expect({ href: slot.href, enabled: slot.enabled }).toEqual({ href: slot.href, enabled: existsSync(page) });
    }
  });
});
