"use server";

import { auth, signOut } from "@/auth";
import { getUserByEmail, updateUser } from "@/lib/sheets/users";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export type ChangementResult = { ok: false; error: string };

/**
 * Changement du mot de passe provisoire.
 *
 * Le mot de passe ACTUEL est redemandé bien que la personne vienne de le
 * saisir au login : une session ouverte sur un poste partagé ne doit pas
 * suffire à s'approprier le compte en posant son propre mot de passe.
 *
 * En cas de succès, l'action DÉCONNECTE et renvoie au login : le jeton de
 * session porte encore le marqueur « à changer », et la reconnexion avec le
 * nouveau mot de passe vérifie immédiatement qu'il fonctionne — mieux vaut
 * le découvrir tout de suite qu'au retour de congé.
 */
export async function changerMotDePasseAction(formData: FormData): Promise<ChangementResult> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, error: "Session expirée — reconnectez-vous." };

  const actuel = String(formData.get("actuel") ?? "");
  const nouveau = String(formData.get("nouveau") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (nouveau.length < 8) return { ok: false, error: "8 caractères minimum." };
  if (!/[a-zA-Z]/.test(nouveau) || !/\d/.test(nouveau)) {
    return { ok: false, error: "Au moins une lettre et un chiffre." };
  }
  if (nouveau !== confirmation) return { ok: false, error: "La confirmation ne correspond pas." };
  if (nouveau === actuel) {
    return { ok: false, error: "Le nouveau mot de passe doit être différent du provisoire." };
  }

  const user = await getUserByEmail(session.user.email);
  if (!user) return { ok: false, error: "Compte introuvable." };
  if (!(await verifyPassword(actuel, user.passwordHash))) {
    return { ok: false, error: "Mot de passe actuel incorrect." };
  }

  await updateUser(user.id, {
    passwordHash: await hashPassword(nouveau),
    mustChangePassword: false,
  });

  // Déconnexion puis retour au login (le redirect interrompt l'action).
  await signOut({ redirectTo: "/login" });
  return { ok: false, error: "" }; // jamais atteint
}
