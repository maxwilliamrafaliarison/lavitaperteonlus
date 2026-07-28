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
  // Horaires choisis à la souris (créneau « libre ») ou dérogatoires.
  const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
  const debutLibre = String(formData.get("debut") ?? "").trim();
  const finLibre = String(formData.get("fin") ?? "").trim();
  if ((debutLibre && !HHMM.test(debutLibre)) || (finLibre && !HHMM.test(finLibre))) {
    return { ok: false, error: "Heure invalide : attendu HH:MM." };
  }

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
      debut: debutLibre,
      fin: finLibre,
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

/**
 * Déplace une affectation d'un jour à un autre (glisser-déposer), en
 * conservant ou ajustant ses horaires.
 *
 * L'identifiant contient le jour : déplacer change donc l'identité de la
 * ligne. On supprime l'ancienne PUIS on écrit la nouvelle — dans cet ordre,
 * car la destination peut déjà porter une affectation du même agent sur le
 * même service (l'unicité la remplacerait) alors qu'un échec en route doit
 * laisser au pire l'original en place, jamais deux copies.
 */
export async function deplacerAffectationAction(formData: FormData): Promise<AffecterResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "planning:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de modifier un planning." };
  }
  const planningId = String(formData.get("planningId") ?? "").trim();
  const agentId = String(formData.get("agentId") ?? "").trim();
  const jourAvant = String(formData.get("jourAvant") ?? "").trim();
  const jour = String(formData.get("jour") ?? "").trim();
  const serviceId = String(formData.get("serviceId") ?? "").trim();
  const creneauId = String(formData.get("creneauId") ?? "").trim() || "libre";
  const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
  const debut = String(formData.get("debut") ?? "").trim();
  const fin = String(formData.get("fin") ?? "").trim();
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!planningId || !agentId || !DATE.test(jourAvant) || !DATE.test(jour)) {
    return { ok: false, error: "Paramètres incomplets." };
  }
  if ((debut && !HHMM.test(debut)) || (fin && !HHMM.test(fin))) {
    return { ok: false, error: "Heure invalide : attendu HH:MM." };
  }

  const idAvant = `AFF-${planningId}-${jourAvant.replace(/-/g, "")}-${agentId}-${serviceId || "x"}`;
  const idApres = `AFF-${planningId}-${jour.replace(/-/g, "")}-${agentId}-${serviceId || "x"}`;
  try {
    if (idAvant !== idApres) await sbDelete("planning", "affectations", { id: `eq.${idAvant}` });
    await sbDelete("planning", "affectations", { id: `eq.${idApres}` });
    await sbInsert("planning", "affectations", [{
      id: idApres, planning_id: planningId, agent_id: agentId, jour,
      creneau_id: creneauId, service_id: serviceId, debut, fin, lieu: "", note: "",
    }]);
    const alertes = await verifierSeuilsAgent(agentId, jour);
    revalidatePath(`/pointage/planning/${planningId}`);
    return { ok: true, alertes };
  } catch (e) {
    return { ok: false, error: `Déplacement impossible : ${String(e).slice(0, 150)}` };
  }
}

/**
 * Recopie une semaine d'affectations sur une autre (geste le plus courant
 * des logiciels d'emploi du temps : la semaine type se propage).
 *
 * Les jours déjà planifiés à destination sont PRÉSERVÉS : recopier ne doit
 * jamais écraser un ajustement fait à la main — le responsable recopie
 * d'abord, ajuste ensuite.
 */
export async function dupliquerSemaineAction(formData: FormData): Promise<
  { ok: true; copiees: number; ignorees: number } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "planning:gerer")) {
    return { ok: false, error: "Votre rôle ne permet pas de modifier un planning." };
  }
  const planningId = String(formData.get("planningId") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const cible = String(formData.get("cible") ?? "").trim();
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!planningId || !DATE.test(source) || !DATE.test(cible) || source === cible) {
    return { ok: false, error: "Paramètres incomplets." };
  }

  const decale = (j: string, n: number) => {
    const d = new Date(`${j}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const finSource = decale(source, 6);
  try {
    const { rows: existantes } = await sbSelect<{ id: string; agent_id: string; jour: string; creneau_id: string; service_id: string; debut: string; fin: string; lieu: string }>(
      "planning", "affectations",
      { select: "*", order: "id.asc", limit: 1000, filters: { planning_id: `eq.${planningId}`, and: `(jour.gte.${source},jour.lte.${finSource})` } },
    );
    const finCible = decale(cible, 6);
    const { rows: dejaLa } = await sbSelect<{ id: string }>(
      "planning", "affectations",
      { select: "id", order: "id.asc", limit: 1000, filters: { planning_id: `eq.${planningId}`, and: `(jour.gte.${cible},jour.lte.${finCible})` } },
    );
    const occupees = new Set(dejaLa.map((x) => x.id));

    const copies: Record<string, unknown>[] = [];
    let ignorees = 0;
    for (const a of existantes) {
      const ecart = Math.round((Date.parse(`${a.jour}T12:00:00Z`) - Date.parse(`${source}T12:00:00Z`)) / 86400000);
      const jour = decale(cible, ecart);
      const id = `AFF-${planningId}-${jour.replace(/-/g, "")}-${a.agent_id}-${a.service_id || "x"}`;
      if (occupees.has(id)) { ignorees++; continue; }
      occupees.add(id);
      copies.push({ id, planning_id: planningId, agent_id: a.agent_id, jour, creneau_id: a.creneau_id, service_id: a.service_id, debut: a.debut, fin: a.fin, lieu: a.lieu, note: "" });
    }
    for (let i = 0; i < copies.length; i += 500) await sbInsert("planning", "affectations", copies.slice(i, i + 500));
    revalidatePath(`/pointage/planning/${planningId}`);
    return { ok: true, copiees: copies.length, ignorees };
  } catch (e) {
    return { ok: false, error: `Duplication impossible : ${String(e).slice(0, 150)}` };
  }
}

export { listCreneaux };
