import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/platform/auth/current-user";
import { buildEvidencePack, parseEvidenceRange } from "@/platform/evidence";
import { hasPermission } from "@/platform/rbac";

/** Downloads the evidence pack ZIP for a date range. Requires audit:export; the export is audited. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "audit:export")) return new Response("Forbidden", { status: 403 });
  const range = parseEvidenceRange(req.nextUrl.searchParams.get("from"), req.nextUrl.searchParams.get("to"));
  const { zip, fileName } = await buildEvidencePack(user, range);
  return new Response(new Blob([zip as BlobPart], { type: "application/zip" }), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
