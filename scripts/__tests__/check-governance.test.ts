import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkGovernance } from "../check-governance";

const GOOD_ACTIONS = `"use server";
import { defineAction } from "@/platform/actions";
export const doThing = defineAction({ tool: "demo", name: "demo.do", permission: "demo:write", input: s, run });
export type Foo = string;
`;
const GOOD_MANIFEST = `export const manifest = { slug: "demo", sensitivity: "pii", piiFields: ["email"] };`;
const REGISTRY = `import { manifest as demoManifest } from "./demo/manifest";\nexport const tools = [\n  demoManifest,\n];\n`;

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "keystone-gov-"));
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    writeFileSync(path.join(root, p), content);
  }
  return root;
}

const base = {
  "src/tools/index.ts": REGISTRY,
  "src/tools/demo/manifest.ts": GOOD_MANIFEST,
  "src/tools/demo/actions.ts": GOOD_ACTIONS,
  "src/tools/demo/__tests__/governance.test.ts": "test",
  "src/tools/demo/queries.ts": "export const list = () => db.thing.findMany();",
};

describe("check-governance", () => {
  it("passes a compliant tool", () => {
    expect(checkGovernance(fixture(base))).toEqual([]);
  });

  it("passes the real repo", () => {
    expect(checkGovernance(path.resolve(__dirname, "../.."))).toEqual([]);
  });

  it("flags exports not created with defineAction", () => {
    const errors = checkGovernance(fixture({ ...base, "src/tools/demo/actions.ts": `${GOOD_ACTIONS}export async function raw() {}\nexport const x = 1;\n` }));
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/actions\.ts:5: every export must be created with defineAction/);
  });

  it("flags Prisma writes outside actions.ts", () => {
    const errors = checkGovernance(fixture({ ...base, "src/tools/demo/pages/page.tsx": "await db.customer.update({ where, data });" }));
    expect(errors).toEqual([expect.stringMatching(/pages\/page\.tsx:1: database writes must go through defineAction/)]);
  });

  it("flags missing manifest, tests and registry entry", () => {
    const errors = checkGovernance(fixture({ "src/tools/index.ts": "export const tools = [];", "src/tools/orphan/actions.ts": "" }));
    expect(errors).toEqual(
      expect.arrayContaining([
        "orphan: missing manifest.ts",
        "orphan: missing __tests__/",
        "orphan: not imported in the registry (src/tools/index.ts)",
      ]),
    );
  });

  it("allows writes in a tool's executors.ts", () => {
    const executors = "registerExecutor('demo.x', { apply: async ({ tx }) => { await tx.thing.update({ where, data }); } });";
    expect(checkGovernance(fixture({ ...base, "src/tools/demo/executors.ts": executors }))).toEqual([]);
  });

  it("accepts route folders that only re-export from the tool", () => {
    const routes = {
      "src/app/(app)/tools/demo/page.tsx": 'import { QueuePage } from "@/tools/demo/pages/queue-page";\n\nexport default QueuePage;\n',
      "src/app/(app)/tools/demo/[id]/page.tsx": 'import { DetailPage } from "@/tools/demo/pages/detail-page";\n\nexport default DetailPage;\n',
    };
    expect(checkGovernance(fixture({ ...base, ...routes }))).toEqual([]);
  });

  it("flags Prisma writes and server actions in route folders", () => {
    const errors = checkGovernance(
      fixture({
        ...base,
        "src/app/(app)/tools/demo/page.tsx": "export default async function P() { await db.thing.create({ data }); }",
        "src/app/(app)/tools/demo/actions.ts": '"use server";\nexport async function sneaky() {}',
      }),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/tools\/demo\/page\.tsx:1: route files only re-export/),
        expect.stringMatching(/tools\/demo\/actions\.ts:1: no "use server" in route files/),
      ]),
    );
    expect(errors).toHaveLength(2);
  });

  it("flags route folders without a matching tool", () => {
    const errors = checkGovernance(fixture({ ...base, "src/app/(app)/tools/ghost/page.tsx": "export default function P() {}" }));
    expect(errors).toEqual(["src/app/(app)/tools/ghost/: route folder has no matching tool in src/tools/ghost/"]);
  });

  it("flags pii/money manifests without piiFields", () => {
    const errors = checkGovernance(fixture({ ...base, "src/tools/demo/manifest.ts": `export const manifest = { sensitivity: "money" };` }));
    expect(errors).toEqual(['demo: manifest sensitivity is "money" but piiFields is missing or empty']);
  });
});
