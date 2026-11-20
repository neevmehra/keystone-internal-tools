import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/platform/auth";
import { canViewCustomers, searchCustomers } from "@/platform/customers";

/** Global search for the Cmd+K palette. Same rules as /search. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!canViewCustomers(user)) return NextResponse.json({ error: "No tool access." }, { status: 403 });
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const outcome = await searchCustomers(user, q);
  return NextResponse.json(outcome, { headers: { "Cache-Control": "no-store" } });
}
