import NextAuth from "next-auth";
import { identityFromOidcClaims } from "./identity";
import { provisionUser } from "./provision";

/**
 * AUTH_MODE=oidc: Auth.js with a generic OIDC provider (Okta, Entra ID,
 * Google Workspace). Wired, not tested against a live IdP.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/sign-in" },
  providers: [
    {
      id: "oidc",
      name: "Company SSO",
      type: "oidc",
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
      authorization: { params: { scope: "openid profile email" } },
    },
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        const user = await provisionUser(identityFromOidcClaims(profile as Record<string, unknown>));
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.uid === "string") session.user = { ...session.user, id: token.uid };
      return session;
    },
  },
});
