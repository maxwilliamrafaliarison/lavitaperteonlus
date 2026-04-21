"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/auth";
import {
  getUserById,
  updateUser,
} from "@/lib/sheets/users";
import { hashPassword, verifyPassword, validatePassword } from "@/lib/auth/password";
import { logAudit, AuditAction } from "@/lib/sheets/audit";
import { isLang, type Lang } from "@/lib/i18n";
import type { AppUser } from "@/types";

export type SettingsState = {
  ok: boolean;
  error?: string;
  user?: AppUser;
};

/* ============================================================
   UPDATE LANG — change la langue de l'utilisateur courant
   ============================================================ */
export async function updateMyLanguageAction(lang: Lang): Promise<SettingsState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };
  if (!isLang(lang)) return { ok: false, error: "Langue invalide." };

  try {
    const user = await updateUser(userSession.user.id, { lang });
    revalidatePath("/settings");
    return { ok: true, user };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ============================================================
   CHANGE PASSWORD — utilisateur change son propre MDP
   ============================================================ */
export async function changeMyPasswordAction(
  currentPassword: string,
  newPassword: string,
): Promise<SettingsState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };

  const user = await getUserById(userSession.user.id);
  if (!user) return { ok: false, error: "Utilisateur introuvable." };

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) return { ok: false, error: "Mot de passe actuel incorrect." };

  const pwdCheck = validatePassword(newPassword);
  if (!pwdCheck.ok) return { ok: false, error: pwdCheck.error };

  if (currentPassword === newPassword) {
    return {
      ok: false,
      error: "Le nouveau mot de passe doit être différent de l'ancien.",
    };
  }

  try {
    const passwordHash = await hashPassword(newPassword);
    const updated = await updateUser(userSession.user.id, { passwordHash });

    const h = await headers();
    await logAudit({
      userId: userSession.user.id,
      userEmail: userSession.user.email ?? "",
      action: AuditAction.EditMaterial, // pas d'action dédiée ; plus tard : "change_password"
      targetType: "user",
      targetId: userSession.user.id,
      details: "Changement de mot de passe (self-service)",
      ip: h.get("x-forwarded-for") ?? "",
      userAgent: h.get("user-agent") ?? "",
    });

    revalidatePath("/settings");
    return { ok: true, user: updated };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
