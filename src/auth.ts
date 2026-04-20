import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { authConfig } from "./auth.config";
import { getUserByEmail, updateUser } from "@/lib/sheets/users";
import { verifyPassword } from "@/lib/auth/password";
import type { UserRole } from "@/types";

/* ============================================================
   AUTH.JS v5 — Configuration complète (runtime Node)
   - Étend authConfig avec le provider Credentials
   - bcrypt + googleapis utilisés ici → ne JAMAIS importer ce
     fichier depuis le middleware (utiliser auth.config.ts à la place)
   ============================================================ */

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await getUserByEmail(email);
        if (!user || !user.active) return null;
        if (!user.passwordHash || user.passwordHash === "TO_SET_IN_PHASE_2") {
          return null;
        }

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        // Best-effort lastLoginAt (non bloquant)
        updateUser(user.id, { lastLoginAt: new Date().toISOString() }).catch(() => {});

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          lang: user.lang,
        } as unknown as { id: string; email: string; name: string; role: UserRole; lang: "fr" | "it" };
      },
    }),
  ],
});
