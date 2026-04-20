"use server";

import { signIn } from "@/auth";
import { logAudit, AuditAction } from "@/lib/sheets/audit";
import { getUserByEmail } from "@/lib/sheets/users";
import { AuthError } from "next-auth";
import { headers } from "next/headers";

export type LoginState = {
  ok: boolean;
  error?: string;
};

export async function loginAction(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, error: "Email et mot de passe requis." };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    // Audit log (best-effort)
    const user = await getUserByEmail(email).catch(() => null);
    if (user) {
      const h = await headers();
      await logAudit({
        userId: user.id,
        userEmail: user.email,
        action: AuditAction.Login,
        targetType: "session",
        targetId: user.id,
        ip: h.get("x-forwarded-for") ?? "",
        userAgent: h.get("user-agent") ?? "",
      });
    }

    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) {
      return {
        ok: false,
        error: "Identifiants invalides ou compte désactivé.",
      };
    }
    console.error("[login] unexpected error", e);
    return { ok: false, error: "Erreur inattendue. Réessayez." };
  }
}
