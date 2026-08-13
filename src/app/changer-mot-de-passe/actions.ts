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

  /* Le message dit CE QUI MANQUE, pas « mot de passe invalide ». Une
     personne à qui l'on répond « invalide » retape la même chose. */
  const manque: string[] = [];
  if (nouveau.length < 8) manque.push(`8 caractères au minimum (vous en avez ${nouveau.length})`);
  if (!/[a-zA-Z]/.test(nouveau)) manque.push("au moins une lettre");
  if (!/\d/.test(nouveau)) manque.push("au moins un chiffre");
  /* Une espace au début ou à la fin est REFUSÉE, pas rognée : la rogner
     enregistrerait un secret différent de celui qui a été tapé — et c'est
     précisément ainsi qu'un mot de passe cesse de fonctionner sans que
     personne comprenne pourquoi. */
  if (nouveau !== nouveau.trim()) manque.push("ni espace au début ni espace à la fin");
  if (manque.length) return { ok: false, error: `Il manque : ${manque.join(", ")}.` };

  if (nouveau !== confirmation) {
    return {
      ok: false,
      error:
        "Les deux saisies diffèrent. Affichez-les avec l'œil pour les comparer — une espace ou une majuscule invisible suffit.",
    };
  }
  if (nouveau === actuel) {
    return { ok: false, error: "Le nouveau mot de passe doit être différent du provisoire." };
  }

  const user = await getUserByEmail(session.user.email);
  if (!user) return { ok: false, error: "Compte introuvable." };
  if (!(await verifyPassword(actuel, user.passwordHash))) {
    return {
      ok: false,
      error:
        "Le mot de passe actuel ne correspond pas. Affichez-le avec l'œil : une majuscule ajoutée par le clavier du téléphone ou une espace en fin de saisie suffisent à le faire refuser.",
    };
  }

  await updateUser(user.id, {
    passwordHash: await hashPassword(nouveau),
    mustChangePassword: false,
  });

  // Déconnexion puis retour au login (le redirect interrompt l'action).
  await signOut({ redirectTo: "/login" });
  return { ok: false, error: "" }; // jamais atteint
}
