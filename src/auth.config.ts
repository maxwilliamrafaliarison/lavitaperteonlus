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

  interface User {
    role?: UserRole;
    lang?: "fr" | "it";
  }
}

const PUBLIC_PATHS = new Set(["/", "/login", "/setup", "/logout"]);

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // ajoutés dans auth.ts (runtime Node)
  callbacks: {
    jwt: async ({ token, user, trigger, session: updatedSession }) => {
      // À la connexion, `user` est défini → on injecte les champs custom dans le JWT
      if (user) {
        const u = user as { id?: string; role?: UserRole; lang?: "fr" | "it" };
        if (u.id) (token as Record<string, unknown>).id = u.id;
        if (u.role) (token as Record<string, unknown>).role = u.role;
        if (u.lang) (token as Record<string, unknown>).lang = u.lang;
      }
      // Lors d'un `update()` depuis le client, on merge les champs permis
      if (trigger === "update" && updatedSession && typeof updatedSession === "object") {
        const s = updatedSession as { lang?: "fr" | "it"; name?: string };
        if (s.lang === "fr" || s.lang === "it") {
          (token as Record<string, unknown>).lang = s.lang;
        }
        if (s.name) (token as Record<string, unknown>).name = s.name;
      }
      return token;
    },
    session: async ({ session, token }) => {
      const t = token as Record<string, unknown>;
      if (t && session.user) {
        session.user.id = (t.id as string) ?? session.user.id;
        session.user.role = (t.role as UserRole) ?? "logistique";
        session.user.lang = (t.lang as "fr" | "it") ?? "fr";
      }
      return session;
    },
    authorized: async ({ auth, request }) => {
      const { pathname } = request.nextUrl;

      const isPublic =
        PUBLIC_PATHS.has(pathname) ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/health") ||
        pathname.startsWith("/_next") ||
        pathname.startsWith("/logo");

      if (isPublic) return true;

      // Tout le reste nécessite une session
      return !!auth?.user;
    },
  },
};
