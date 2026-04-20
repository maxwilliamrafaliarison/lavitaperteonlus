"use server";

import { signOut, auth } from "@/auth";
import { logAudit, AuditAction } from "@/lib/sheets/audit";

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
