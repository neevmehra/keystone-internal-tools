/**
 * Governance check (runs in CI). Fails if:
 * - an export in src/tools/<slug>/actions.ts isn't created with defineAction(
 * - a file under src/tools/ writes through Prisma outside a tool's actions.ts
 *   (or executors.ts, whose writes the approvals engine commits and audits)
 * - a tool's route folder, src/app/(app)/tools/<slug>/, does anything but
 *   re-export from the tool: no Prisma writes and no "use server"
 * - a tool is missing manifest.ts or __tests__/, or isn't in the registry
 * - a manifest's sensitivity is "pii" or "money" but piiFields is missing
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const PRISMA_WRITE =
  /\b(?:db|prisma|tx|client)\s*\.\s*\w+\s*\.\s*(?:create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(|\$executeRaw(?:Unsafe)?\b|new\s+PrismaClient\b/;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name) ? [full] : [];
  });
}

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

export function checkGovernance(root: string): string[] {
  const errors: string[] = [];
  const toolsDir = path.join(root, "src/tools");
  const rel = (p: string) => path.relative(root, p);
  const registryPath = path.join(toolsDir, "index.ts");
  const registry = existsSync(registryPath) ? readFileSync(registryPath, "utf8") : "";
  if (!registry) errors.push("src/tools/index.ts (the tool registry) is missing");

  const slugs = existsSync(toolsDir) ? readdirSync(toolsDir).filter((n) => statSync(path.join(toolsDir, n)).isDirectory()) : [];

  for (const slug of slugs) {
    const dir = path.join(toolsDir, slug);
    const manifestPath = path.join(dir, "manifest.ts");
    if (!existsSync(manifestPath)) errors.push(`${slug}: missing manifest.ts`);
    const testsDir = path.join(dir, "__tests__");
    if (!existsSync(testsDir) || walk(testsDir).length === 0) errors.push(`${slug}: missing __tests__/`);

    const imp = registry.match(new RegExp(`import\\s*\\{\\s*manifest\\s+as\\s+(\\w+)\\s*\\}\\s*from\\s*["']\\./${slug}/manifest["']`));
    if (!imp) errors.push(`${slug}: not imported in the registry (src/tools/index.ts)`);
    else if (!new RegExp(`\\b${imp[1]}\\b`).test(registry.slice(registry.indexOf("tools"))))
      errors.push(`${slug}: imported but not listed in the registry's tools array`);

    if (existsSync(manifestPath)) {
      const manifest = readFileSync(manifestPath, "utf8");
      const sensitive = manifest.match(/sensitivity\s*:\s*["'](pii|money)["']/);
      const pii = manifest.match(/piiFields\s*:\s*\[([^\]]*)\]/);
      if (sensitive && (!pii || !/["'`]\w+/.test(pii[1]))) {
        errors.push(`${slug}: manifest sensitivity is "${sensitive[1]}" but piiFields is missing or empty`);
      }
    }

    const actionsPath = path.join(dir, "actions.ts");
    if (existsSync(actionsPath)) {
      const text = readFileSync(actionsPath, "utf8");
      for (const m of text.matchAll(/^[ \t]*export\b[^\n]*/gm)) {
        const stmt = text.slice(m.index);
        if (/^\s*export\s+(type|interface)\b/.test(stmt)) continue;
        if (/^\s*export\s+const\s+\w+\s*(?::[^=]+)?=\s*defineAction\s*\(/.test(stmt)) continue;
        errors.push(`${rel(actionsPath)}:${lineOf(text, m.index)}: every export must be created with defineAction(`);
      }
    }
  }

  for (const file of walk(toolsDir)) {
    const parts = path.relative(toolsDir, file).split(path.sep);
    if (parts.length === 2 && (parts[1] === "actions.ts" || parts[1] === "executors.ts")) continue;
    const text = readFileSync(file, "utf8");
    const m = text.match(PRISMA_WRITE);
    if (m && m.index !== undefined) {
      errors.push(`${rel(file)}:${lineOf(text, m.index)}: database writes must go through defineAction in actions.ts`);
    }
  }

  // Route folders only re-export pages from src/tools/<slug>/. Logic and
  // writes in app/ would bypass the checks above.
  const routesDir = path.join(root, "src/app/(app)/tools");
  if (existsSync(routesDir)) {
    for (const name of readdirSync(routesDir)) {
      if (statSync(path.join(routesDir, name)).isDirectory() && !slugs.includes(name)) {
        errors.push(`src/app/(app)/tools/${name}/: route folder has no matching tool in src/tools/${name}/`);
      }
    }
    for (const file of walk(routesDir)) {
      const text = readFileSync(file, "utf8");
      const write = text.match(PRISMA_WRITE);
      if (write && write.index !== undefined) {
        errors.push(`${rel(file)}:${lineOf(text, write.index)}: route files only re-export from src/tools/<slug>/; database writes must go through defineAction`);
      }
      const useServer = text.match(/^\s*["']use server["']/m);
      if (useServer && useServer.index !== undefined) {
        errors.push(`${rel(file)}:${lineOf(text, useServer.index)}: no "use server" in route files; put actions in src/tools/<slug>/actions.ts`);
      }
    }
  }

  for (const m of registry.matchAll(/from\s*["']\.\/([\w-]+)\/manifest["']/g)) {
    if (!slugs.includes(m[1])) errors.push(`registry imports "${m[1]}" but src/tools/${m[1]}/ does not exist`);
  }
  return errors;
}

if (process.argv[1]?.endsWith("check-governance.ts")) {
  const errors = checkGovernance(path.resolve(__dirname, ".."));
  if (errors.length) {
    console.error(`Governance check failed (${errors.length}):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log("Governance check passed.");
}
