/**
 * Builds the exact prompt a Devin session receives for a tool request.
 * Pure and dependency-free, so the request form can show a live preview of
 * the same text the server sends.
 */

/** First line of every prompt: loads the org skill (this org uses skills, not playbook IDs). */
export const SKILL_LINE = "@skills:new-internal-tool";

export const REQUEST_KINDS = ["new_tool", "change_tool"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export type RequestDraft = {
  kind: RequestKind;
  title: string;
  toolSlug?: string | null;
  toolName?: string | null;
  problem: string;
  audienceGroups: readonly string[];
  workflow: string;
  signOff?: string | null;
  signOffAboveCents?: number | null;
  involvesPii: boolean;
  movesMoney: boolean;
  peopleCount?: number | null;
  hoursPerWeek?: number | null;
};

export type Requester = { name: string; groups: readonly string[] };

const dollars = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);

const orDash = (s: string | null | undefined, fallback = "(not answered yet)") => (s && s.trim() ? s.trim() : fallback);

function signOffLine(d: RequestDraft) {
  const text = d.signOff?.trim();
  if (!text && d.signOffAboveCents == null) return "Nothing mentioned.";
  const above = d.signOffAboveCents != null ? ` Required above ${dollars(d.signOffAboveCents)}.` : "";
  return `${text || "Yes."}${above}`;
}

function todayLine(d: RequestDraft) {
  const people = d.peopleCount ? `${d.peopleCount} ${d.peopleCount === 1 ? "person" : "people"}` : null;
  const hours = d.hoursPerWeek ? `about ${d.hoursPerWeek} hours a week in total` : null;
  if (!people && !hours) return "Not estimated.";
  return [people, hours].filter(Boolean).join(", ") + ".";
}

export function buildDevinPrompt(d: RequestDraft, requester: Requester): string {
  const isChange = d.kind === "change_tool";
  const target = isChange
    ? `Change to an existing tool: ${orDash(d.toolName ?? d.toolSlug, "(no tool picked yet)")}${d.toolSlug ? ` (slug: ${d.toolSlug})` : ""}`
    : "New tool";
  const groups = requester.groups.length ? requester.groups.join(", ") : "none";
  const audience = d.audienceGroups.length ? d.audienceGroups.join(", ") : "(not specified)";

  const scope = isChange
    ? `This is a change to an existing tool. Work in src/tools/${d.toolSlug ?? "<slug>"}/ and only touch the platform if the change requires it, calling that out in the PR.`
    : "This is a new tool. Run the scaffold first, then build it out.";

  return [
    SKILL_LINE,
    "",
    `Keystone request: ${orDash(d.title, "(untitled)")}`,
    `Type: ${target}`,
    `Requested by: ${requester.name} (IdP groups: ${groups})`,
    "",
    isChange ? "What should change?" : "What problem are we solving?",
    orDash(d.problem),
    "",
    `Who will use it (IdP groups): ${audience}`,
    "",
    "What people need to do:",
    orDash(d.workflow),
    "",
    `Sign-off: ${signOffLine(d)}`,
    `Customer personal data: ${d.involvesPii ? "yes, mask it for anyone without pii:read" : "no"}`,
    `Moves money: ${d.movesMoney ? "yes, route it through the approvals engine" : "no"}`,
    `Today: ${todayLine(d)}`,
    "",
    `${scope} Follow the new-internal-tool skill. When the PR is ready, reply to ${requester.name} in plain English with screenshots and the assumptions to confirm.`,
  ].join("\n");
}
