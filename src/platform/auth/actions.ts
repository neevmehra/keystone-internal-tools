"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthMode } from "./config";
import { findDemoIdentity } from "./demo-identities";
import { MOCK_SESSION_COOKIE, MOCK_SESSION_MAX_AGE, createSessionToken } from "./mock-session";
import { provisionUser } from "./provision";

export async function demoSignInAction(formData: FormData) {
  if (getAuthMode() !== "mock") throw new Error("Demo sign-in is only available in AUTH_MODE=mock.");
  const identity = findDemoIdentity(String(formData.get("username") ?? ""));
  if (!identity) redirect("/sign-in");
  const user = await provisionUser(identity);
  const jar = await cookies();
  jar.set(MOCK_SESSION_COOKIE, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MOCK_SESSION_MAX_AGE,
  });
  redirect("/");
}

export async function oidcSignInAction() {
  const { signIn } = await import("./oidc");
  await signIn("oidc", { redirectTo: "/" });
}

export async function signOutAction() {
  if (getAuthMode() === "mock") {
    (await cookies()).delete(MOCK_SESSION_COOKIE);
    redirect("/sign-in");
  }
  const { signOut } = await import("./oidc");
  await signOut({ redirectTo: "/sign-in" });
}
