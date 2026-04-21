"use server";

import { signOut, auth } from "@/auth";
import { logAudit, AuditAction } from "@/lib/sheets/audit";

/**
 * Logout complet (audit + signOut + redirect).
 * À appeler depuis un form action. Lève NEXT_REDIRECT.
 */
export async function logoutAction() {
  const session = await auth();
  if (session?.user) {
    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email ?? "",
      action: AuditAction.Logout,
      targetType: "session",
      targetId: session.user.id,
    });
  }
  await signOut({ redirectTo: "/login" });
}

/**
 * Variante qui log l'audit SANS faire signOut ni redirect.
 * Utilisée par le dropdown menu : le signOut est fait côté client
 * via next-auth/react pour éviter les conflits de portal Base UI.
 */
export async function logoutAuditAction() {
  const session = await auth();
  if (!session?.user) return { ok: true };
  try {
    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email ?? "",
      action: AuditAction.Logout,
      targetType: "session",
      targetId: session.user.id,
    });
  } catch {
    // best-effort
  }
  return { ok: true };
}
