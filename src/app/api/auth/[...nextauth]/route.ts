import type { NextRequest } from "next/server";
import { getAuthMode } from "@/platform/auth/config";

async function handle(req: NextRequest) {
  if (getAuthMode() !== "oidc") return new Response("Not found", { status: 404 });
  const { handlers } = await import("@/platform/auth/oidc");
  return req.method === "POST" ? handlers.POST(req) : handlers.GET(req);
}

export { handle as GET, handle as POST };
