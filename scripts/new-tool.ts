/**
 * Deterministic tool scaffold (no AI):  npm run new-tool <slug> "<Display Name>"
 * Copies templates/tool/ to src/tools/<slug>/, fills in names, registers the
 * manifest in src/tools/index.ts and its (optional) customer panels in
 * src/tools/customer-panels.ts, adds `<slug>:read` and `<slug>:write` to
 * permissions.ts with no roles, and creates route stubs under
 * src/app/(app)/tools/<slug>/. Fails if the slug exists.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "templates/tool");
const PERMISSIONS = path.join(ROOT, "src/platform/rbac/permissions.ts");
const REGISTRY = path.join(ROOT, "src/tools/index.ts");
const CUSTOMER_PANELS = path.join(ROOT, "src/tools/customer-panels.ts");

export function toIdentifiers(slug: string) {
  const pascal = slug
    .split("-")
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");
  return { pascal, camel: pascal[0].toLowerCase() + pascal.slice(1) };
}

function fill(text: string, slug: string, name: string) {
  const { pascal } = toIdentifiers(slug);
  return text.replaceAll("__SLUG__", slug).replaceAll("__TOOL_NAME__", name).replaceAll("__PASCAL__", pascal);
}

function copyDir(src: string, dest: string, slug: string, name: string, created: string[]) {
  for (const entry of readdirSync(src).sort()) {
    const from = path.join(src, entry);
    if (statSync(from).isDirectory()) {
      copyDir(from, path.join(dest, entry), slug, name, created);
      continue;
    }
    const to = path.join(dest, entry.replace(/\.tpl$/, ""));
    mkdirSync(path.dirname(to), { recursive: true });
    writeFileSync(to, fill(readFileSync(from, "utf8"), slug, name));
    created.push(path.relative(ROOT, to));
  }
}

function insertBefore(file: string, marker: string, lines: string[]) {
  const text = readFileSync(file, "utf8");
  const idx = text.indexOf(marker);
  if (idx === -1) throw new Error(`Marker "${marker}" not found in ${path.relative(ROOT, file)}`);
  const lineStart = text.lastIndexOf("\n", idx) + 1;
  const indent = text.slice(lineStart, idx);
  writeFileSync(file, text.slice(0, lineStart) + lines.map((l) => `${indent}${l}\n`).join("") + text.slice(lineStart));
}

export function newTool(slug: string, name: string) {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(slug) || slug.length > 40) {
    throw new Error(`Invalid slug "${slug}". Use lowercase letters, digits and dashes, e.g. "kyc-review".`);
  }
  if (!name?.trim()) throw new Error('Missing display name: npm run new-tool <slug> "<Display Name>"');
  const toolDir = path.join(ROOT, "src/tools", slug);
  const routeDir = path.join(ROOT, "src/app/(app)/tools", slug);
  if (existsSync(toolDir) || existsSync(routeDir) || readFileSync(REGISTRY, "utf8").includes(`"./${slug}/manifest"`)) {
    throw new Error(`Tool "${slug}" already exists.`);
  }

  const created: string[] = [];
  for (const entry of readdirSync(TEMPLATE)) {
    const from = path.join(TEMPLATE, entry);
    if (entry === "app") copyDir(from, routeDir, slug, name.trim(), created);
    else if (statSync(from).isDirectory()) copyDir(from, path.join(toolDir, entry), slug, name.trim(), created);
    else {
      const to = path.join(toolDir, entry.replace(/\.tpl$/, ""));
      mkdirSync(toolDir, { recursive: true });
      writeFileSync(to, fill(readFileSync(from, "utf8"), slug, name.trim()));
      created.push(path.relative(ROOT, to));
    }
  }

  const { camel } = toIdentifiers(slug);
  insertBefore(REGISTRY, "// keystone:tool-imports", [`import { manifest as ${camel}Manifest } from "./${slug}/manifest";`]);
  insertBefore(REGISTRY, "// keystone:tool-entries", [`${camel}Manifest,`]);
  insertBefore(PERMISSIONS, "// keystone:tool-permissions", [`"${slug}:read",`, `"${slug}:write",`]);
  insertBefore(CUSTOMER_PANELS, "// keystone:customer-panel-imports", [
    `import { customerPanels as ${camel}CustomerPanels } from "./${slug}/customer-panels";`,
  ]);
  insertBefore(CUSTOMER_PANELS, "// keystone:customer-panel-entries", [`...${camel}CustomerPanels,`]);
  return created.sort();
}

if (process.argv[1]?.endsWith("new-tool.ts")) {
  const [slug, ...nameParts] = process.argv.slice(2);
  try {
    const created = newTool(slug ?? "", nameParts.join(" "));
    console.log(`Created tool "${slug}":`);
    for (const f of created) console.log(`  ${f}`);
    console.log("  updated src/tools/index.ts, src/tools/customer-panels.ts and src/platform/rbac/permissions.ts");
    console.log(`\nNext: grant ${slug}:read / ${slug}:write to roles in permissions.ts, replace the example action, then run the checks.`);
  } catch (err) {
    console.error(`new-tool: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
