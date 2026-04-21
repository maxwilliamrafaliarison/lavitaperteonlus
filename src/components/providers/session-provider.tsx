"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

/**
 * Wrapper autour de SessionProvider de next-auth pour permettre l'utilisation
 * de useSession() dans les client components (ex: /settings pour update la langue).
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
