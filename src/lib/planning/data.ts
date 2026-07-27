import { randomBytes } from "node:crypto";

import { sbSelect, sbInsert, sbUpdate } from "@/lib/supabase-server";
import { dureeCreneau, plagesDuJour, type Creneau } from "./creneau";

/* ============================================================
   PLANNING — accès aux données (schéma `planning`)
   ============================================================ */

const SCHEMA = "planning";

export interface Service {
  id: string;
  libelle: string;
  centre: string;
  rang: number;
  couleur: string;
  actif: boolean;
}

export interface Planning {
  id: string;
  centre: string;
  du: string;
  au: string;
  libelle: string;
  statut: string; // brouillon | publie | archive
  token_public: string;
  publie_par: string;
  publie_le: string;
  modifie_par: string;
  modifie_le: string;
  note: string;
}

export interface Affectation {
  id: string;
  planning_id: string;
  agent_id: string;
  jour: string;
  creneau_id: string;
  service_id: string;
  debut: string;
  fin: string;
  lieu: string;
  note: string;
}

async function lireTout<T>(table: string, ordre: string, filters: Record<string, string> = {}): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let offset = 0; ; offset += page) {
    const { rows } = await sbSelect<T>(SCHEMA, table, { select: "*", order: ordre, limit: page, offset, filters });
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

export const listServices = () => lireTout<Service>("services", "rang.asc");
export const listCreneaux = () => lireTout<Creneau>("creneaux", "type.asc,minutes.desc");
export const listPlannings = () => lireTout<Planning>("plannings", "du.desc");

export const listAffectations = (planningId: string) =>
  lireTout<Affectation>("affectations", "jour.asc", { planning_id: `eq.${planningId}` });

/** Affectations d'une période, tous plannings confondus (pour le calcul). */
export const affectationsPeriode = (du: string, au: string) =>
  lireTout<Affectation>("affectations", "jour.asc", { and: `(jour.gte.${du},jour.lte.${au})` });

/**
 * Jeton de consultation : 32 caractères hexadécimaux tirés au sort
 * cryptographiquement (128 bits d'entropie).
 *
 * C'est la seule protection de la page publique (choix 1a) : elle doit donc
 * être hors de portée d'une devinette ou d'un balayage d'URL. Un compteur ou
 * un identifiant lisible exposerait le planning nominatif de tout le
 * personnel — donc qui est absent, en congé ou en arrêt.
 */
export function genererToken(): string {
  return randomBytes(16).toString("hex");
}

export const creerPlanning = (p: Record<string, unknown>) => sbInsert(SCHEMA, "plannings", [p]);
export const majPlanning = (id: string, p: Record<string, unknown>) =>
  sbUpdate(SCHEMA, "plannings", { id: `eq.${id}` }, p);
export const insererAffectations = async (rows: Record<string, unknown>[]) => {
  for (let i = 0; i < rows.length; i += 500) await sbInsert(SCHEMA, "affectations", rows.slice(i, i + 500));
};

/** Planning publié correspondant à un jeton — null si inconnu ou non publié. */
export async function planningParToken(token: string): Promise<Planning | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const { rows } = await sbSelect<Planning>(SCHEMA, "plannings", {
    select: "*",
    order: "du.desc",
    limit: 1,
    filters: { token_public: `eq.${token}`, statut: "eq.publie" },
  });
  return rows[0] ?? null;
}

export interface JourPlanifie {
  jour: string;
  creneauId: string;
  serviceId: string;
  lieu: string;
  minutes: number;
  plages: Array<{ debut: string; fin: string }>;
}

/**
 * Ce que l'agent DEVAIT faire chaque jour de la période — la référence à
 * laquelle comparer ses pointages (choix 3a).
 */
export async function planifiePourAgents(
  du: string,
  au: string,
): Promise<Map<string, Map<string, JourPlanifie>>> {
  const [affectations, creneaux] = await Promise.all([affectationsPeriode(du, au), listCreneaux()]);
  const parCreneau = new Map(creneaux.map((c) => [c.id, c]));

  const out = new Map<string, Map<string, JourPlanifie>>();
  for (const a of affectations) {
    const c = parCreneau.get(a.creneau_id);
    if (!c) continue;
    // Un horaire dérogatoire saisi sur l'affectation prime sur le modèle.
    const eff = a.debut && a.fin ? { ...c, debut: a.debut, fin: a.fin, minutes: 0 } : c;
    const parJour = out.get(a.agent_id) ?? new Map<string, JourPlanifie>();
    parJour.set(a.jour, {
      jour: a.jour,
      creneauId: c.id,
      serviceId: a.service_id,
      lieu: a.lieu,
      minutes: dureeCreneau(eff),
      plages: plagesDuJour(a.jour, eff),
    });
    out.set(a.agent_id, parJour);
  }
  return out;
}
