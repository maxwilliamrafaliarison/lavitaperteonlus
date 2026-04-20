import type { NextAuthConfig, DefaultSession } from "next-auth";
import type { UserRole } from "@/types";

/* ============================================================
   AUTH CONFIG (edge-safe)
   - Pas d'imports lourds (bcrypt, googleapis) ici
   - Utilisé par le middleware (Edge runtime)
   - Étendu dans auth.ts avec le provider Credentials (Node only)
   ============================================================ */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      lang: "fr" | "it";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    lang: "fr" | "it";
  }
}

const PUBLIC_PATHS = new Set(["/", "/login", "/setup"]);

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // ajoutés dans auth.ts (runtime Node)
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        const u = user as { id?: string; role?: UserRole; lang?: "fr" | "it" };
        if (u.id) token.id = u.id;
        if (u.role) token.role = u.role;
        if (u.lang) token.lang = u.lang;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.lang = token.lang;
      }
      return session;
    },
    authorized: async ({ auth, request }) => {
      const { pathname } = request.nextUrl;

      const isPublic =
        PUBLIC_PATHS.has(pathname) ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/_next") ||
        pathname.startsWith("/logo");

      if (isPublic) return true;

      // Tout le reste nécessite une session
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
