import { sbSelect, sbInsert } from "@/lib/supabase-server";
import {
  calculerJournee,
  agregerMois,
  fusionnerPassages,
  type HoraireTheorique,
  type JourneeCalculee,
} from "./calcul";

/* ============================================================
   POINTAGE — accès aux données (schéma `pointage`)
   ============================================================
   Le calcul reste dans calcul.ts (module pur, testé). Ici on lit la base
   et on assemble : agents + badges + pointages + ajustements → journées.
   ============================================================ */

const SCHEMA = "pointage";

export interface Agent {
  id: string;
  nom: string;
  prenom: string;
  site: string;
  statut: string; // salarie | prestataire
  poste: string;
  service: string;
  horaire_id: string;
  taux_horaire: number;
  actif: boolean;
}

export interface Horaire {
  id: string;
  libelle: string;
  matin_debut: string;
  matin_fin: string;
  aprem_debut: string;
  aprem_fin: string;
  jours_travailles: string;
  tolerance_minutes: number;
  minutes_jour: number;
}

export interface Pointage {
  id: string;
  agent_id: string;
  site_pointage: string;
  horodatage: string;
  jour: string;
  sens_brut: string;
  verif: string;
  appareil: string;
}

export interface Ajustement {
  id: string;
  agent_id: string;
  jour: string;
  matin_debut: string;
  matin_fin: string;
  aprem_debut: string;
  aprem_fin: string;
  motif: string;
  type_absence: string;
  auteur_email: string;
  timestamp: string;
}

/** Lit une table entière du schéma pointage, en paginant (cap PostgREST 1000). */
/**
 * Nom lisible d'un agent, sans répétition.
 *
 * Deux champs cohabitent : `prenom` est le prénom usuel enregistré dans la
 * pointeuse (« Emma »), `nom` l'identité complète issue du registre du
 * personnel (« RAFENOSOA Emma »). Les concaténer donne « Emma RAFENOSOA
 * Emma ».
 *
 * On ne supprime pas le prénom usuel pour autant : c'est LA clé de
 * rapprochement avec les badgeages et les plannings, où les gens ne sont
 * désignés que par lui. Le doublon se règle donc à l'affichage — quand
 * l'identité complète contient déjà le prénom usuel, elle se suffit.
 */
/**
 * L'agent est-il rattaché à ce centre ?
 *
 * La DRH écrit « MIARAKA/REX » pour les dix personnes qui tiennent un poste
 * dans les deux centres — et c'est la réalité que les badgeages avaient déjà
 * montrée : le lieu du badge ne dit pas le lieu du travail. Une comparaison
 * stricte les faisait disparaître des DEUX grilles, chacune ne reconnaissant
 * pas la chaîne entière.
 */
export function rattacheA(site: string, centre: string): boolean {
  return (site || "")
    .split(/[\/,+]/)
    .map((s) => s.trim().toUpperCase())
    .includes(centre.trim().toUpperCase());
}

export function nomAffiche(a: Pick<Agent, "prenom" | "nom"> & { id?: string }): string {
  const prenom = (a.prenom ?? "").trim();
  const nom = (a.nom ?? "").trim();
  if (!nom) return prenom || a.id || "";
  if (!prenom) return nom;
  // Comparaison insensible à la casse et aux accents : « Hervé » dans
  // « RAKOTOHAJANIRINA Herve » doit être reconnu.
  const sansAccents = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const motsDuNom = sansAccents(nom).split(/\s+/);
  return motsDuNom.includes(sansAccents(prenom)) ? nom : `${prenom} ${nom}`;
}

async function lireTout<T>(
  table: string,
  ordre: string,
  filters: Record<string, string> = {},
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let offset = 0; ; offset += page) {
    // `order` explicite : sans lui, LIMIT/OFFSET n'a aucun ordre garanti en
    // Postgres et des lignes seraient dupliquées ou omises silencieusement.
    const { rows } = await sbSelect<T>(SCHEMA, table, {
      select: "*",
      order: ordre,
      limit: page,
      offset,
      filters,
    });
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

export const listAgents = () => lireTout<Agent>("agents", "nom.asc");
export const listHoraires = () => lireTout<Horaire>("horaires", "id.asc");
export const listAjustements = () => lireTout<Ajustement>("ajustements", "jour.asc");

/**
 * Heures supplémentaires accordées.
 *
 * Table jumelle des ajustements : même structure de traçabilité, un auteur
 * et un horodatage. Elle n'était lue nulle part, faute d'écran pour la
 * montrer ; l'historique des corrections lui en donne un.
 */
export interface HeureSup {
  id: string;
  agent_id: string;
  jour: string;
  minutes: number;
  motif: string;
  valide_par: string;
  timestamp: string;
}

export const listHeuresSup = () => lireTout<HeureSup>("heures_sup", "jour.asc");

/**
 * Pointages d'une période (bornes incluses, "YYYY-MM-DD").
 * PostgREST n'accepte qu'une valeur par clé de query : pour un intervalle,
 * on passe par `and=(...)`, qui exprime les deux bornes en un seul filtre.
 */
export async function listPointages(du: string, au: string): Promise<Pointage[]> {
  return lireTout<Pointage>("pointages", "horodatage.asc", {
    and: `(jour.gte.${du},jour.lte.${au})`,
  });
}

export async function insererPointages(lignes: Record<string, unknown>[]): Promise<void> {
  if (!lignes.length) return;
  // Par lots : PostgREST plafonne la taille des requêtes.
  const LOT = 500;
  for (let i = 0; i < lignes.length; i += LOT) {
    await sbInsert(SCHEMA, "pointages", lignes.slice(i, i + LOT));
  }
}

export const insererAgents = (lignes: Record<string, unknown>[]) =>
  lignes.length ? sbInsert(SCHEMA, "agents", lignes) : Promise.resolve();
export const insererBadges = (lignes: Record<string, unknown>[]) =>
  lignes.length ? sbInsert(SCHEMA, "badges", lignes) : Promise.resolve();
export const insererImport = (ligne: Record<string, unknown>) =>
  sbInsert(SCHEMA, "imports", [ligne]);
export const insererAjustement = (ligne: Record<string, unknown>) =>
  sbInsert(SCHEMA, "ajustements", [ligne]);

/** Convertit une ligne `horaires` en horaire théorique pour le moteur. */
export function versHoraireTheorique(h: Horaire): HoraireTheorique {
  return {
    matinDebut: h.matin_debut,
    matinFin: h.matin_fin,
    apremDebut: h.aprem_debut,
    apremFin: h.aprem_fin,
    joursTravailles: String(h.jours_travailles)
      .split(",")
      .map((n) => Number(n.trim()))
      .filter((n) => n >= 1 && n <= 7),
    toleranceMinutes: Number(h.tolerance_minutes ?? 5),
    minutesJour: Number(h.minutes_jour ?? 420),
  };
}

export interface EtatAgentMois {
  agent: Agent;
  journees: JourneeCalculee[];
  total: ReturnType<typeof agregerMois>;
}

/**
 * État mensuel de tous les agents : pour chaque agent, chaque jour du mois
 * est calculé (présence, retard, HS proposées…), puis agrégé.
 */
export async function etatMensuel(du: string, au: string): Promise<EtatAgentMois[]> {
  const [agents, horaires, pointages, ajustements] = await Promise.all([
    listAgents(),
    listHoraires(),
    listPointages(du, au),
    listAjustements(),
  ]);

  const parHoraire = new Map(horaires.map((h) => [h.id, versHoraireTheorique(h)]));
  const defaut = parHoraire.get("std") ?? versHoraireTheorique({
    id: "std", libelle: "", matin_debut: "08:00", matin_fin: "12:00",
    aprem_debut: "14:00", aprem_fin: "17:00", jours_travailles: "1,2,3,4,5,6",
    tolerance_minutes: 5, minutes_jour: 420,
  });

  // Index pointages et ajustements par agent+jour.
  const parAgentJour = new Map<string, { horodatage: string; jour: string }[]>();
  for (const p of pointages) {
    const k = `${p.agent_id}|${p.jour}`;
    const arr = parAgentJour.get(k) ?? [];
    arr.push({ horodatage: p.horodatage, jour: p.jour });
    parAgentJour.set(k, arr);
  }
  const ajParAgentJour = new Map(
    ajustements.filter((a) => a.jour >= du && a.jour <= au).map((a) => [`${a.agent_id}|${a.jour}`, a]),
  );

  const jours = joursDeLaPeriode(du, au);

  return agents
    .filter((a) => a.actif)
    .map((agent) => {
      const horaire = parHoraire.get(agent.horaire_id) ?? defaut;
      const estPrestataire = agent.statut === "prestataire";
      const journees = jours.map((jour) => {
        const evs = parAgentJour.get(`${agent.id}|${jour}`) ?? [];
        const aj = ajParAgentJour.get(`${agent.id}|${jour}`);
        return calculerJournee(
          jour,
          evs,
          horaire,
          aj
            ? {
                matinDebut: aj.matin_debut || undefined,
                matinFin: aj.matin_fin || undefined,
                apremDebut: aj.aprem_debut || undefined,
                apremFin: aj.aprem_fin || undefined,
                typeAbsence: aj.type_absence || undefined,
              }
            : undefined,
          estPrestataire, // règle LIM
        );
      });
      return { agent, journees, total: agregerMois(journees) };
    });
}

/** Liste des jours "YYYY-MM-DD" entre deux bornes incluses. */
export function joursDeLaPeriode(du: string, au: string): string[] {
  const out: string[] = [];
  const d = new Date(`${du}T12:00:00Z`);
  const fin = new Date(`${au}T12:00:00Z`);
  while (d <= fin) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export interface PresenceAgent {
  agent: Agent;
  dernierPointage: string; // "HH:MM"
  site: string;
  present: boolean;
  /**
   * Tous les passages du jour, en ordre chronologique, en "HH:MM".
   *
   * La pointeuse n'enregistre PAS le sens : `sens_brut` vaut « none ». C'est
   * l'ALTERNANCE qui le donne, et elle seule : le premier passage est une
   * entrée, le deuxième une sortie, et ainsi de suite. La même règle fonde
   * déjà le calcul de présence, où un nombre impair signifie « entré sans
   * être ressorti ». On rend donc la suite brute, et l'affichage en déduit
   * les sens plutôt que d'inventer un champ qui n'existe pas.
   */
  passages: string[];
}

/**
 * Qui est présent MAINTENANT : dernier pointage du jour par agent. Un nombre
 * IMPAIR de passages signifie que la personne est entrée sans être ressortie
 * → présente. Pair (ou zéro) → absente ou déjà repartie.
 */
export async function presenceDuJour(jour: string): Promise<{
  presents: PresenceAgent[];
  absents: Agent[];
  parSite: Record<string, number>;
}> {
  const [agents, pointages] = await Promise.all([listAgents(), listPointages(jour, jour)]);
  const actifs = agents.filter((a) => a.actif);
  const parAgent = new Map<string, Pointage[]>();
  for (const p of pointages) {
    const arr = parAgent.get(p.agent_id) ?? [];
    arr.push(p);
    parAgent.set(p.agent_id, arr);
  }

  const presents: PresenceAgent[] = [];
  const absents: Agent[] = [];
  const parSite: Record<string, number> = {};

  for (const agent of actifs) {
    const bruts = (parAgent.get(agent.id) ?? []).sort((a, b) =>
      a.horodatage.localeCompare(b.horodatage),
    );
    if (bruts.length === 0) {
      absents.push(agent);
      continue;
    }
    /* MÊME FUSION QUE LE CALCUL DES JOURNÉES. Sans elle, cet écran comptait
       les badges bruts pendant que les états mensuels comptaient les badges
       fusionnés : deux réponses pour une même donnée. Un double badge à deux
       secondes suffisait à faire d'une personne présente une personne
       repartie, et inversement. */
    const horodatages = fusionnerPassages(bruts);
    const evs = bruts.filter((e) => horodatages.includes(e.horodatage));
    const dernier = evs[evs.length - 1];
    const present = evs.length % 2 === 1;
    if (present) {
      presents.push({
        agent,
        dernierPointage: dernier.horodatage.slice(11, 16),
        site: dernier.site_pointage,
        present,
        passages: evs.map((e) => e.horodatage.slice(11, 16)),
      });
      parSite[dernier.site_pointage] = (parSite[dernier.site_pointage] ?? 0) + 1;
    } else {
      absents.push(agent);
    }
  }

  return { presents, absents, parSite };
}
