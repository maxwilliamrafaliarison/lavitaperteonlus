import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/* ============================================================
   Middleware edge — n'utilise QUE authConfig (sans Credentials)
   pour rester compatible Edge runtime (pas de bcrypt/googleapis).
   La logique d'autorisation est dans authConfig.callbacks.authorized.
   ============================================================ */

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api/auth (NextAuth handlers)
     * - _next/static, _next/image (assets)
     * - favicon, logo files, .svg/.png/.jpg/.jpeg/.gif/.webp
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|logo/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
