"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { insererAjustement } from "@/lib/pointage/data";
import { sbInsert } from "@/lib/supabase-server";
import { versMinutes } from "@/lib/pointage/calcul";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

/**
 * Corrige une journée : heures rattrapées ou absence déclarée.
 *
 * Le pointage brut de la machine n'est JAMAIS modifié — cette correction
 * s'ajoute par-dessus, avec motif, auteur et horodatage. On peut donc
 * toujours répondre à « qu'a enregistré la pointeuse ? » ET « qu'a décidé
 * le responsable, et pourquoi ? ». Un écrasement rendrait la paie
 * indéfendable en cas de contestation.
 */
export async function corrigerJourneeAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "pointage:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de corriger un pointage." };
  }

  const agentId = String(formData.get("agentId") ?? "").trim();
  const jour = String(formData.get("jour") ?? "").trim();
  const motif = String(formData.get("motif") ?? "").trim();
  const typeAbsence = String(formData.get("typeAbsence") ?? "").trim();
  const heures = {
    matin_debut: String(formData.get("matinDebut") ?? "").trim(),
    matin_fin: String(formData.get("matinFin") ?? "").trim(),
    aprem_debut: String(formData.get("apremDebut") ?? "").trim(),
    aprem_fin: String(formData.get("apremFin") ?? "").trim(),
  };

  if (!agentId || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) {
    return { ok: false, error: "Agent ou date invalide." };
  }
  // Le motif est la contrepartie du pouvoir de corriger : sans lui, la
  // correction n'est pas auditable.
  if (motif.length < 3) {
    return { ok: false, error: "Le motif est obligatoire (3 caractères minimum)." };
  }

  const saisies = Object.values(heures).filter(Boolean);
  if (!typeAbsence && saisies.length === 0) {
    return { ok: false, error: "Indiquez des heures corrigées ou un type d'absence." };
  }
  for (const [champ, v] of Object.entries(heures)) {
    if (v && !HHMM.test(v)) return { ok: false, error: `Heure invalide (${champ}) : attendu HH:MM.` };
  }
  // Une plage dont la fin précède le début produirait un temps négatif.
  for (const [d, f] of [
    [heures.matin_debut, heures.matin_fin],
    [heures.aprem_debut, heures.aprem_fin],
  ]) {
    if (d && f) {
      const md = versMinutes(d);
      const mf = versMinutes(f);
      if (md !== null && mf !== null && mf <= md) {
        return { ok: false, error: "L'heure de fin doit suivre l'heure de début." };
      }
    }
  }

  try {
    await insererAjustement({
      // Un seul ajustement par agent et par jour : ré-corriger remplace.
      id: `ADJ-${agentId}-${jour}`,
      agent_id: agentId,
      jour,
      ...heures,
      motif,
      type_absence: typeAbsence,
      auteur_email: session.user.email ?? "",
      timestamp: new Date().toISOString(),
    });
    revalidatePath("/pointage/corrections");
    revalidatePath("/pointage/etats");
    return { ok: true, message: "Correction enregistrée." };
  } catch (e) {
    const msg = String(e);
    // Conflit de clé = une correction existe déjà pour ce jour.
    if (msg.includes("409") || msg.includes("duplicate")) {
      return { ok: false, error: "Une correction existe déjà pour cette journée." };
    }
    return { ok: false, error: `Enregistrement impossible : ${msg.slice(0, 160)}` };
  }
}

/**
 * Accorde des heures supplémentaires (choix 3a : le moteur PROPOSE au-delà de
 * l'horaire théorique, le responsable ACCORDE — des heures présentes ne sont
 * pas automatiquement des heures dues).
 */
export async function validerHeuresSupAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "pointage:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de valider des heures supplémentaires." };
  }

  const agentId = String(formData.get("agentId") ?? "").trim();
  const jour = String(formData.get("jour") ?? "").trim();
  const minutes = Number(formData.get("minutes") ?? 0);
  const motif = String(formData.get("motif") ?? "").trim();

  if (!agentId || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) {
    return { ok: false, error: "Agent ou date invalide." };
  }
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { ok: false, error: "Durée invalide." };
  }

  try {
    await sbInsert("pointage", "heures_sup", [
      {
        id: `HS-${agentId}-${jour}`,
        agent_id: agentId,
        jour,
        minutes,
        motif,
        valide_par: session.user.email ?? "",
        timestamp: new Date().toISOString(),
      },
    ]);
    revalidatePath("/pointage/corrections");
    revalidatePath("/pointage/etats");
    return { ok: true, message: "Heures supplémentaires accordées." };
  } catch (e) {
    const msg = String(e);
    if (msg.includes("409") || msg.includes("duplicate")) {
      return { ok: false, error: "Ces heures ont déjà été validées." };
    }
    return { ok: false, error: `Validation impossible : ${msg.slice(0, 160)}` };
  }
}
