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
import { getT, isLang, type Lang } from "@/lib/i18n";
import type { AppUser } from "@/types";

export type SettingsState = {
  ok: boolean;
  error?: string;
  user?: AppUser;
};

/** Résout la langue à partir de la session, fallback FR. */
function langFromSession(sessionLang: unknown): Lang {
  return isLang(sessionLang) ? sessionLang : "fr";
}

/* ============================================================
   UPDATE LANG — change la langue de l'utilisateur courant
   ============================================================ */
export async function updateMyLanguageAction(lang: Lang): Promise<SettingsState> {
  const userSession = await auth();
  if (!userSession?.user) {
    // Pas de session = pas de lang ; on retourne en FR par défaut
    return { ok: false, error: getT("fr")("settings.error_unauthenticated") };
  }
  const t = getT(langFromSession(userSession.user.lang));
  if (!isLang(lang)) return { ok: false, error: t("settings.error_invalid_lang") };

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
  if (!userSession?.user) {
    return { ok: false, error: getT("fr")("settings.error_unauthenticated") };
  }
  const t = getT(langFromSession(userSession.user.lang));

  const user = await getUserById(userSession.user.id);
  if (!user) return { ok: false, error: t("settings.error_user_not_found") };

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) return { ok: false, error: t("settings.error_current_wrong") };

  const pwdCheck = validatePassword(newPassword);
  if (!pwdCheck.ok) {
    return { ok: false, error: t(`password_validation.${pwdCheck.code}`) };
  }

  if (currentPassword === newPassword) {
    return { ok: false, error: t("settings.error_same_password") };
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
