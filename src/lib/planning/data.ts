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

/**
 * Affectations d'une période, tous plannings confondus (pour le calcul).
 *
 * `agents` restreint la lecture aux personnes qui intéressent l'appelant.
 * Sans ce filtre, contrôler une semaine de REX chargeait aussi tout MIARAKA
 * — plusieurs milliers de lignes lues page par page — et la page finissait
 * par expirer. La règle générale du module tient en une phrase : ne jamais
 * ramener ce qu'on ne va pas regarder.
 */
export const affectationsPeriode = (du: string, au: string, agents?: string[]) =>
  /* Tri sur DEUX colonnes dont la seconde est unique. `jour` ne l'est pas :
     une cinquantaine de lignes portent la même date, et paginer par
     LIMIT/OFFSET sur un ordre partiel n'a aucune garantie en Postgres. Au
     franchissement des mille lignes, la même affectation pouvait revenir
     deux fois pendant qu'une autre disparaissait, ce qui fausse aussi bien
     le contrôle des seuils que le décompte d'expérience. */
  lireTout<Affectation>("affectations", "jour.asc,id.asc", {
    and: `(jour.gte.${du},jour.lte.${au})`,
    ...(agents?.length ? { agent_id: `in.(${agents.map((a) => `"${a}"`).join(",")})` } : {}),
  });

export interface ParametrePlanning {
  cle: string;
  valeur: string;
  note: string;
}

/**
 * Réglages du planning, en table plutôt qu'en dur : le plafond d'avance
 * varie d'un poste à l'autre (quinze minutes pour la sécurité, trente
 * ailleurs) et la RH doit pouvoir le changer sans qu'on redéploie.
 */
export const listParametresPlanning = () =>
  lireTout<ParametrePlanning>("parametres", "cle.asc");

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

/**
 * Plannings publiés portant ce jeton, du plus récent au plus ancien.
 *
 * LE JETON DÉSIGNE LE CENTRE, PAS LA SEMAINE. Chaque semaine de REX est un
 * planning distinct : donner un jeton neuf à chacune obligeait à
 * rediffuser une adresse tous les lundis, et l'ancienne continuait
 * d'afficher une semaine périmée sans le dire. Le jeton est donc réutilisé
 * d'une publication à l'autre — le personnel garde le même lien, et c'est
 * le contenu qui avance.
 */
export async function planningsParToken(token: string): Promise<Planning[]> {
  if (!/^[a-f0-9]{32}$/.test(token)) return [];
  const { rows } = await sbSelect<Planning>(SCHEMA, "plannings", {
    select: "*",
    order: "du.desc",
    limit: 200,
    filters: { token_public: `eq.${token}`, statut: "eq.publie" },
  });
  return rows;
}

/**
 * Le planning à montrer pour une date donnée.
 *
 * Celui qui couvre la date demandée ; à défaut, le plus récent qui la
 * PRÉCÈDE — on ne projette pas quelqu'un dans une semaine future qui n'est
 * pas encore publiée ; à défaut encore, le plus ancien publié.
 */
export async function planningParToken(token: string, jour?: string): Promise<Planning | null> {
  const tous = await planningsParToken(token);
  if (!tous.length) return null;
  if (!jour) return tous[0];
  return (
    tous.find((p) => p.du <= jour && jour <= p.au) ??
    tous.find((p) => p.au < jour) ??
    tous[tous.length - 1]
  );
}

/** Jeton public déjà en usage dans un centre, s'il en existe un. */
export async function tokenDuCentre(centre: string): Promise<string> {
  const { rows } = await sbSelect<Planning>(SCHEMA, "plannings", {
    select: "token_public",
    order: "publie_le.desc",
    limit: 50,
    filters: { centre: `eq.${centre}` },
  });
  return rows.find((p) => /^[a-f0-9]{32}$/.test(p.token_public))?.token_public ?? "";
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
    /* Un horaire dérogatoire saisi sur l'affectation prime sur le modèle —
       ENTIÈREMENT. Il remplaçait jusqu'ici la seule première plage, et la
       coupure de l'après-midi du modèle survivait : Aliniaina, dérogation
       « 07:00-17:00 » sur un modèle « 8h-12h / 14h-17h », ressortait en
       « 07:00–17:00 / 14:00–17:00 » — trois heures comptées deux fois.
       Écrire un horaire à la main, c'est décrire toute la journée. */
    const eff = a.debut && a.fin ? { ...c, debut: a.debut, fin: a.fin, debut2: "", fin2: "", minutes: 0 } : c;
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
