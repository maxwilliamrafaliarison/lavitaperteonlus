"use server";

import { listUsers, updateUser, getUserByEmail } from "@/lib/sheets/users";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { getT, isLang, type Lang } from "@/lib/i18n";

export type SetupState = {
  ok: boolean;
  error?: string;
  message?: string;
};

export async function setupAdminAction(
  _prev: SetupState | undefined,
  formData: FormData,
): Promise<SetupState> {
  // Récupère la langue choisie côté client (input caché). Fallback FR.
  const rawLang = String(formData.get("lang") ?? "fr");
  const lang: Lang = isLang(rawLang) ? rawLang : "fr";
  const t = getT(lang);

  try {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    if (!email || !password) {
      return { ok: false, error: t("setup.error_required") };
    }
    if (password !== confirm) {
      return { ok: false, error: t("setup.error_mismatch") };
    }

    const validation = validatePassword(password);
    if (!validation.ok) {
      return { ok: false, error: t(`password_validation.${validation.code}`) };
    }

    // L'utilisateur doit exister dans le Sheet et avoir un MDP non défini
    let user;
    try {
      user = await getUserByEmail(email);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("Google Sheets non configuré") || msg.includes("DECODER")) {
        return { ok: false, error: t("setup.error_sheet_config") };
      }
      return { ok: false, error: t("setup.error_sheet_read", { detail: msg }) };
    }

    if (!user) {
      return { ok: false, error: t("setup.error_no_user") };
    }
    if (user.passwordHash && user.passwordHash !== "TO_SET_IN_PHASE_2") {
      return { ok: false, error: t("setup.error_already_set") };
    }

    const hash = await hashPassword(password);

    try {
      await updateUser(user.id, { passwordHash: hash, active: true });
    } catch (e) {
      return { ok: false, error: t("setup.error_sheet_write", { detail: String(e) }) };
    }

    return { ok: true, message: t("setup.success_message") };
  } catch (e) {
    // Filet de sécurité — tout autre crash devient un message lisible
    console.error("[setup] unexpected error", e);
    return { ok: false, error: t("setup.error_unexpected", { detail: String(e) }) };
  }
}

/** Vérifie si un setup initial est nécessaire (au moins un compte avec TO_SET_IN_PHASE_2). */
export async function isInitialSetupNeeded(): Promise<boolean> {
  try {
    const users = await listUsers();
    if (users.length === 0) return true;
    return users.some((u) => !u.passwordHash || u.passwordHash === "TO_SET_IN_PHASE_2");
  } catch {
    // Si Sheet non accessible (env vars manquantes), on autorise le setup
    return true;
  }
}
