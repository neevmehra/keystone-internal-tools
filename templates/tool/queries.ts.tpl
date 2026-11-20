import type { Prisma } from "@prisma/client";
import { db } from "@/platform/db";
import { maskRecord } from "@/platform/rbac";
import type { CurrentUser } from "@/platform/auth";
import type { TableParams } from "@/platform/ui/table-params";
import { manifest } from "./manifest";

export const SORTABLE = ["createdAt", "name", "status", "riskTier"] as const;
export const FILTERS = ["status", "riskTier", "id"] as const;

/** Reads only. Records are masked on the server before they reach the browser. */
export async function listRecords(user: CurrentUser, p: TableParams<(typeof SORTABLE)[number]>) {
  const where: Prisma.CustomerWhereInput = {
    ...(p.filters.status && { status: p.filters.status }),
    ...(p.filters.riskTier && { riskTier: p.filters.riskTier }),
    ...(p.filters.id && { id: { contains: p.filters.id } }),
  };
  const [rows, total] = await Promise.all([
    db.customer.findMany({ where, orderBy: [{ [p.sort]: p.dir }, { id: "asc" }], skip: p.skip, take: p.take }),
    db.customer.count({ where }),
  ]);
  return { rows: rows.map((r) => maskRecord(r, manifest.piiFields, user)), total };
}

export async function getRecord(user: CurrentUser, id: string) {
  const row = await db.customer.findUnique({ where: { id } });
  return row && maskRecord(row, manifest.piiFields, user);
}
