import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as auditModule from "@/platform/audit";
import { db } from "@/platform/db";

const SRC = path.resolve(__dirname, "../../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("audit module", () => {
  it("exposes no update or delete", () => {
    const names = Object.keys(auditModule);
    expect(names).toContain("recordAudit");
    expect(names.filter((n) => /update|delete|remove|purge|truncate|edit|upsert/i.test(n))).toEqual([]);
  });

  it("is never updated or deleted anywhere in the app code", () => {
    const offenders = sourceFiles(SRC).filter((f) =>
      /auditEvent\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\b|UPDATE\s+"?AuditEvent|DELETE\s+FROM\s+"?AuditEvent/i.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("rolls back with the surrounding transaction", async () => {
    const entityId = `ent_${Date.now()}`;
    await expect(
      db.$transaction(async (tx) => {
        await auditModule.recordAudit(tx, {
          actor: { id: "u", name: "U", roles: [] },
          tool: "test",
          action: "x",
          entityType: "Thing",
          entityId,
        });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await db.auditEvent.count({ where: { entityId } })).toBe(0);
  });

  it("computes field-level diffs", () => {
    expect(auditModule.diffAudit({ status: "pending", a: 1 }, { status: "approved", a: 1 })).toEqual([
      { field: "status", before: "pending", after: "approved" },
    ]);
  });
});
