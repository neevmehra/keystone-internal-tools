/**
 * Server-side field masking. Users without `pii:read` get masked values, so
 * unmasked PII never reaches their browser.
 */
export const MASK = "•••";

type Holder = { permissions: readonly string[] } | null | undefined;

export function maskValue(value: unknown, field = ""): unknown {
  if (value === null || value === undefined || value === "") return value;
  if (typeof value !== "string") return MASK;
  const s = value.trim();
  const email = s.match(/^([^@\s]+)@([^@\s]+)$/);
  if (email) return `${email[1][0]}${MASK}@${email[2]}`;
  const digits = s.replace(/\D/g, "");
  if (/card|pan|last4|account|iban|phone|ssn|tax/i.test(field) || (digits.length >= 4 && digits.length / s.length > 0.6)) {
    return `•••• ${digits.slice(-4)}`;
  }
  return s
    .split(/\s+/)
    .map((part) => `${part[0]}${MASK}`)
    .join(" ");
}

export function maskRecord<T extends Record<string, unknown>>(
  record: T,
  piiFields: readonly string[],
  user: Holder,
): T {
  if (user?.permissions.includes("pii:read")) return record;
  const copy: Record<string, unknown> = { ...record };
  for (const field of piiFields) {
    if (field in copy) copy[field] = maskValue(copy[field], field);
  }
  return copy as T;
}

export function maskRecords<T extends Record<string, unknown>>(
  records: readonly T[],
  piiFields: readonly string[],
  user: Holder,
): T[] {
  return records.map((r) => maskRecord(r, piiFields, user));
}
