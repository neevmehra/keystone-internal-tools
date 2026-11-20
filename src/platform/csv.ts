/** CSV helpers shared by exports (audit log, evidence pack). RFC 4180 quoting. */
export function csvCell(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ""
      : value instanceof Date
        ? value.toISOString()
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: readonly unknown[]): string {
  return `${values.map(csvCell).join(",")}\n`;
}

export function toCsv(header: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  return csvRow(header) + rows.map(csvRow).join("");
}
