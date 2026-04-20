"use server";

import { listUsers, updateUser, getUserByEmail } from "@/lib/sheets/users";
import { hashPassword, validatePassword } from "@/lib/auth/password";

export type SetupState = {
  ok: boolean;
  error?: string;
  message?: string;
};

export async function setupAdminAction(
  _prev: SetupState | undefined,
  formData: FormData,
): Promise<SetupState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!email || !password) {
    return { ok: false, error: "Email et mot de passe requis." };
  }
  if (password !== confirm) {
    return { ok: false, error: "Les mots de passe ne correspondent pas." };
  }

  const validation = validatePassword(password);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  // L'utilisateur doit exister dans le Sheet et avoir un MDP non défini
  const user = await getUserByEmail(email);
  if (!user) {
    return {
      ok: false,
      error:
        "Aucun utilisateur avec cet email dans le Sheet. Vérifiez l'onglet `users` ou contactez l'admin.",
    };
  }
  if (user.passwordHash && user.passwordHash !== "TO_SET_IN_PHASE_2") {
    return {
      ok: false,
      error:
        "Ce compte a déjà un mot de passe défini. Utilisez la page de connexion ou réinitialisez via l'admin.",
    };
  }

  const hash = await hashPassword(password);
  await updateUser(user.id, { passwordHash: hash, active: true });

  return {
    ok: true,
    message: "Mot de passe défini avec succès. Vous pouvez maintenant vous connecter.",
  };
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
