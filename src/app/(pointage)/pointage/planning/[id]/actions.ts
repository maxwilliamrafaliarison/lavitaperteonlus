"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { sbInsert, sbUpdate, sbDelete, sbSelect } from "@/lib/supabase-server";
import { listCreneaux, verifierSeuilsAgent } from "./verif";

export type AffecterResult =
  | { ok: true; supprime?: boolean; alertes: string[] }
  | { ok: false; error: string };

/**
 * Affecte un créneau à un agent pour un jour, ou retire l'affectation quand
 * le créneau choisi est vide.
 *
 * Les seuils légaux sont contrôlés APRÈS écriture et rendus au client comme
 * avertissements : le responsable doit pouvoir enregistrer une organisation
 * exceptionnelle (remplacement d'urgence, garde imprévue) tout en sachant
 * immédiatement qu'elle sort du cadre. Bloquer la saisie le pousserait à
 * tenir son planning ailleurs, hors de tout contrôle.
 */
export async function affecterAction(formData: FormData): Promise<AffecterResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "planning:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de modifier un planning." };
  }

  const planningId = String(formData.get("planningId") ?? "").trim();
  const agentId = String(formData.get("agentId") ?? "").trim();
  const jour = String(formData.get("jour") ?? "").trim();
  const creneauId = String(formData.get("creneauId") ?? "").trim();
  const serviceId = String(formData.get("serviceId") ?? "").trim();
  const lieu = String(formData.get("lieu") ?? "").trim();

  if (!planningId || !agentId || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) {
    return { ok: false, error: "Paramètres incomplets." };
  }

  const id = `AFF-${planningId}-${jour.replace(/-/g, "")}-${agentId}-${serviceId || "x"}`;

  try {
    // Créneau vide = on retire l'affectation plutôt que d'enregistrer un vide,
    // qui se lirait comme « planifié à zéro heure » et non « non planifié ».
    if (!creneauId) {
      await sbDelete("planning", "affectations", { id: `eq.${id}` });
      revalidatePath(`/pointage/planning/${planningId}`);
      return { ok: true, supprime: true, alertes: [] };
    }

    const { rows: existant } = await sbSelect<{ id: string }>("planning", "affectations", {
      select: "id",
      order: "id.asc",
      limit: 1,
      filters: { id: `eq.${id}` },
    });

    const ligne = {
      planning_id: planningId,
      agent_id: agentId,
      jour,
      creneau_id: creneauId,
      service_id: serviceId,
      debut: "",
      fin: "",
      lieu,
      note: "",
    };

    if (existant.length) {
      await sbUpdate("planning", "affectations", { id: `eq.${id}` }, ligne);
    } else {
      await sbInsert("planning", "affectations", [{ id, ...ligne }]);
    }

    const alertes = await verifierSeuilsAgent(agentId, jour);
    revalidatePath(`/pointage/planning/${planningId}`);
    return { ok: true, alertes };
  } catch (e) {
    return { ok: false, error: `Enregistrement impossible : ${String(e).slice(0, 150)}` };
  }
}

export { listCreneaux };
