"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { sbUpdate } from "@/lib/supabase-server";
import { dureePlage } from "@/lib/planning/creneau";

export type MajResult = { ok: true; minutes: number } | { ok: false; error: string };

/**
 * Modifie la durée retenue pour un créneau.
 *
 * Pourquoi cette valeur est réglable plutôt que déduite de l'amplitude : une
 * garde peut inclure des heures de repos non décomptées, et l'usage du centre
 * prime alors sur le calcul brut. Les plannings de MIARAKA comptaient ainsi
 * « 11H-8H » tantôt 21 h, tantôt 24 h selon les semaines. Le barème doit donc
 * être une décision explicite de l'établissement, visible et modifiable —
 * pas une constante enfouie dans le code.
 */
export async function majDureeCreneauAction(formData: FormData): Promise<MajResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "pointage:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de modifier les créneaux." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const heures = Number(formData.get("heures") ?? 0);
  const minutesReste = Number(formData.get("minutes") ?? 0);
  if (!id) return { ok: false, error: "Créneau inconnu." };
  if (!Number.isFinite(heures) || heures < 0 || heures > 24) {
    return { ok: false, error: "Durée invalide (0 à 24 heures)." };
  }
  if (!Number.isFinite(minutesReste) || minutesReste < 0 || minutesReste > 59) {
    return { ok: false, error: "Minutes invalides (0 à 59)." };
  }

  const minutes = Math.round(heures * 60 + minutesReste);
  if (minutes > 1440) return { ok: false, error: "Un créneau ne peut excéder 24 heures." };

  try {
    await sbUpdate("planning", "creneaux", { id: `eq.${id}` }, { minutes });
    revalidatePath("/pointage/creneaux");
    revalidatePath("/pointage/etats");
    return { ok: true, minutes };
  } catch (e) {
    return { ok: false, error: `Enregistrement impossible : ${String(e).slice(0, 150)}` };
  }
}

/** Amplitude réelle d'un créneau, proposée comme repère face au barème. */
export async function amplitudeReelle(debut: string, fin: string): Promise<number> {
  return dureePlage(debut, fin);
}
