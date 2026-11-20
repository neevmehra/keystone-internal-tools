import { describe, expect, it } from "vitest";
import { parseTableParams } from "@/platform/ui/table-params";

describe("parseTableParams", () => {
  const opts = { sortable: ["createdAt", "name"] as const, defaultSort: "createdAt" as const, filters: ["status"] };
  it("reads paging, sorting and filters from the URL", () => {
    expect(parseTableParams({ page: "3", pageSize: "50", sort: "name", dir: "asc", status: "active", evil: "x" }, opts)).toEqual({
      page: 3, pageSize: 50, sort: "name", dir: "asc", skip: 100, take: 50, filters: { status: "active" },
    });
  });
  it("ignores unknown sort columns and bad values", () => {
    expect(parseTableParams({ page: "-2", pageSize: "100000", sort: "password", dir: "sideways" }, opts)).toMatchObject({
      page: 1, pageSize: 25, sort: "createdAt", dir: "desc",
    });
  });
});
