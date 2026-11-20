import { describe, expect, it } from "vitest";
import { formatAbsolute, formatCurrency } from "@/platform/ui/format";

describe("formatting", () => {
  it("formats cents as currency and absolute dates in UTC", () => {
    expect(formatCurrency(123456)).toBe("$1,234.56");
    expect(formatAbsolute(new Date("2026-11-19T21:30:00Z"))).toBe("Nov 19, 2026, 9:30 PM UTC");
  });
});
