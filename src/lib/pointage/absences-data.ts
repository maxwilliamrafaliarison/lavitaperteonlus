import { sbSelect, sbInsert, sbUpdate } from "@/lib/supabase-server";

import {
  REGLES,
  calculerSolde,
  chevauche,
  compterJours,
  debutExercice,
  estActive,
  estNature,
  joursDePeriode,
  libelleNature,
  type ModeDecompte,
  type SoldeConges,
} from "./absences";
import type { Agent } from "./data";

/* ⚠️ IMPORT DE TYPE UNIQUEMENT vers ./data, et c'est délibéré.
   `data.ts` lit ce module pour alimenter l'état mensuel en absences. Lui
   emprunter en retour `listAgents` fermerait un cycle d'imports : les deux
   modules s'attendraient mutuellement à l'initialisation, et `listAgents`
   étant un `const` (donc non hoisté), l'un des deux le trouverait dans sa
   zone morte temporelle selon l'ordre choisi par le bundler. Le symptôme
   n'apparaîtrait qu'en production, sur une page et pas sur une autre.
   La liste des agents se relit donc ici, en une ligne. */

/* ============================================================
   ABSENCES — accès aux données (schéma `pointage`)
   ============================================================
   Le calcul reste dans absences.ts, module pur et testé. Ici on lit la
   base et on assemble. Même partage qu'entre calcul.ts et data.ts.
   ============================================================ */

const SCHEMA = "pointage";

export interface Absence {
  id: string;
  agent_id: string;
  nature: string;
  du: string;
  au: string;
  demi_debut: string;
  demi_fin: string;
  etat: string;
  motif: string;
  jours_decomptes: number;
  demande_par: string;
  demande_le: string;
  decide_par: string;
  decide_le: string;
  decision_note: string;
}

export interface Ferie {
  jour: string;
  libelle: string;
  centre: string;
}

export interface CompteurConges {
  agent_id: string;
  date_entree: string;
  /** "" tant que la personne est en poste. */
  date_sortie: string;
  reporte: number;
  exercice: string;
  note: string;
}

export interface ParametrePointage {
  cle: string;
  valeur: string;
  libelle: string;
}

/**
 * La table est-elle simplement absente de la base ?
 *
 * PostgREST répond 404 avec le code PGRST205 quand la relation n'existe
 * pas. C'est le seul cas qu'on absorbe : une panne réseau, un droit refusé
 * ou une requête mal formée doivent continuer de remonter, sinon on
 * masquerait un vrai problème derrière un tableau vide.
 */
function tableAbsente(e: unknown): boolean {
  const msg = String(e);
  return msg.includes("PGRST205") || msg.includes("42P01");
}

/**
 * Lecture TOLÉRANTE à l'absence de la table.
 *
 * ── POURQUOI CETTE TOLÉRANCE EXISTE ──────────────────────────────────────
 * Le code part en production avant que la migration 023 ne soit appliquée à
 * la main sur Supabase, et il y a toujours un intervalle entre les deux.
 * Pendant cet intervalle, `etatMensuel` et le moteur d'écarts lisent les
 * absences. Sans ce filet, une table manquante ferait tomber l'état
 * mensuel, l'écran des écarts et le rapport PDF, c'est-à-dire des
 * fonctions qui marchaient très bien avant qu'on ajoute les congés.
 *
 * Une fonctionnalité neuve ne doit jamais emporter celles qui existent. En
 * l'absence de la table, on se comporte donc comme s'il n'y avait aucune
 * absence, ce qui est exactement l'état du monde avant la migration. Seul
 * l'écran des congés le signale, puisque c'est le seul que cela empêche
 * réellement de fonctionner.
 */
async function lireSiPossible<T>(
  table: string,
  ordre: string,
  filters: Record<string, string> = {},
): Promise<T[]> {
  try {
    return await lireTout<T>(table, ordre, filters);
  } catch (e) {
    if (tableAbsente(e)) return [];
    throw e;
  }
}

/** Lit une table entière du schéma, en paginant (cap PostgREST à 1000). */
async function lireTout<T>(
  table: string,
  ordre: string,
  filters: Record<string, string> = {},
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let offset = 0; ; offset += page) {
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

/**
 * La migration 023 a-t-elle été appliquée ?
 *
 * Les lectures tolèrent l'absence de la table pour ne pas emporter le reste
 * du pointage, mais l'écran des congés, lui, doit le DIRE. Un tableau vide
 * sans explication laisse croire qu'il n'y a aucune absence enregistrée,
 * alors que le module n'est simplement pas encore installé, et la personne
 * saisirait dix déclarations avant de comprendre qu'aucune n'a été prise.
 */
export async function moduleAbsencesInstalle(): Promise<boolean> {
  try {
    await sbSelect(SCHEMA, "absences", { select: "id", limit: 1 });
    return true;
  } catch (e) {
    if (tableAbsente(e)) return false;
    // Panne réelle : on ne la maquille pas en « module non installé ».
    throw e;
  }
}

export const listFeries = () => lireSiPossible<Ferie>("feries", "jour.asc");
export const listCompteurs = () => lireSiPossible<CompteurConges>("conges_compteurs", "agent_id.asc");
export const listParametresPointage = () => lireSiPossible<ParametrePointage>("parametres", "cle.asc");

/**
 * Absences qui TOUCHENT la période, et non celles qui y sont contenues.
 *
 * La nuance décide de tout : un congé du 28 août au 4 septembre concerne la
 * semaine du 31 août, alors qu'aucune de ses deux bornes n'y tombe. Filtrer
 * sur `du >= debut` l'aurait fait disparaître de la semaine qu'il traverse,
 * et la personne serait réapparue au planning en plein congé.
 *
 * La condition de recouvrement de deux intervalles fermés s'écrit
 * `absence.du <= au && absence.au >= du`, ce que PostgREST exprime en un
 * seul filtre `and=(...)`.
 */
export async function listAbsences(du: string, au: string): Promise<Absence[]> {
  /* Tri sur DEUX colonnes dont la seconde est unique. Paginer sur `du.asc`
     seul revient à faire un LIMIT/OFFSET sans ordre total : Postgres ne
     garantit alors rien entre deux lignes de même date, et une ligne peut
     être rendue deux fois ou pas du tout d'une page à l'autre. */
  return lireSiPossible<Absence>("absences", "du.asc,id.asc", {
    and: `(du.lte.${au},au.gte.${du})`,
  });
}

/** Toutes les absences d'une personne, du plus récent au plus ancien. */
export async function absencesAgent(agentId: string): Promise<Absence[]> {
  return lireSiPossible<Absence>("absences", "du.desc,id.desc", { agent_id: `eq.${agentId}` });
}

/** Demandes encore à trancher, les plus proches d'abord. */
export async function absencesEnAttente(): Promise<Absence[]> {
  return lireSiPossible<Absence>("absences", "du.asc,id.asc", { etat: "eq.demande" });
}

export const insererAbsence = (ligne: Record<string, unknown>) =>
  sbInsert(SCHEMA, "absences", [ligne]);

/**
 * Met à jour une absence, éventuellement sous condition d'état de départ.
 *
 * `etatAttendu` transforme la mise à jour en écriture conditionnelle : elle
 * ne touche la ligne que si elle est encore dans l'état qu'on croyait. Sans
 * cela, deux personnes décidant en même temps, ou un onglet resté ouvert
 * depuis la veille, écrasent la décision de l'autre sans que rien ne le
 * signale. Le nombre de lignes touchées dit à l'appelant ce qui s'est passé.
 */
export const majAbsence = (
  id: string,
  patch: Record<string, unknown>,
  etatAttendu?: string,
) =>
  sbUpdate(
    SCHEMA,
    "absences",
    etatAttendu ? { id: `eq.${id}`, etat: `eq.${etatAttendu}` } : { id: `eq.${id}` },
    patch,
  );

export const insererFerie = (ligne: Record<string, unknown>) =>
  sbInsert(SCHEMA, "feries", [ligne]);

/* ── Assemblages ──────────────────────────────────────────────────────── */

/** Ce qu'un écran a besoin de savoir d'une absence, un jour donné. */
export interface AbsenceDuJour {
  absenceId: string;
  nature: string;
  libelle: string;
  /** Le pointage doit-il cesser de signaler cette journée ? */
  neutraliseEcarts: boolean;
  /** La personne travaille-t-elle malgré tout (mission) ? */
  compteCommeTravail: boolean;
}

/**
 * Index « agent + jour → absence active », pour une période.
 *
 * Un index plutôt qu'une recherche linéaire : les écrans qui s'en servent
 * bouclent sur cinquante-huit agents multipliés par trente et un jours, et
 * une recherche dans un tableau à chaque case coûterait mille sept cents
 * parcours complets par affichage.
 *
 * Seules les absences ACCEPTÉES entrent : une demande en attente ne doit
 * rien neutraliser, sinon poser une demande suffirait à faire disparaître
 * ses propres retards.
 */
export function indexerAbsences(absences: Absence[]): Map<string, AbsenceDuJour> {
  const index = new Map<string, AbsenceDuJour>();
  for (const a of absences) {
    if (!estActive(a.etat)) continue;
    const regle = estNature(a.nature) ? REGLES[a.nature] : null;
    const info: AbsenceDuJour = {
      absenceId: a.id,
      nature: a.nature,
      libelle: libelleNature(a.nature),
      neutraliseEcarts: regle?.neutraliseEcarts ?? true,
      compteCommeTravail: regle?.compteCommeTravail ?? false,
    };
    for (const jour of joursDePeriode(a.du, a.au)) {
      index.set(`${a.agent_id}|${jour}`, info);
    }
  }
  return index;
}

export const cleAbsence = (agentId: string, jour: string) => `${agentId}|${jour}`;

/** Mode de décompte et taux d'acquisition, tels que paramétrés. */
export interface ReglagesConges {
  mode: ModeDecompte;
  acquisitionParMois: number;
  /** Début de l'exercice de congés, au format « MM-JJ ». */
  exerciceDebut: string;
}

export function reglagesDe(parametres: ParametrePointage[]): ReglagesConges {
  const map = new Map(parametres.map((p) => [p.cle, p.valeur]));
  const mode = map.get("conges_mode_decompte") === "ouvre" ? "ouvre" : "calendaire";
  const taux = Number(map.get("conges_acquisition_mois"));
  const exercice = String(map.get("conges_exercice_debut") ?? "");
  return {
    mode,
    acquisitionParMois: Number.isFinite(taux) && taux > 0 ? taux : 2.5,
    exerciceDebut: /^\d{2}-\d{2}$/.test(exercice) ? exercice : "01-01",
  };
}

/**
 * Jours à décompter pour une absence, selon sa nature et les réglages.
 *
 * Les natures qui ne touchent pas au solde rendent zéro : compter les jours
 * d'un arrêt maladie n'aurait aucun usage et prêterait à confusion sur un
 * écran de solde.
 */
export function joursADecompter(
  nature: string,
  du: string,
  au: string,
  reglages: ReglagesConges,
  joursTravailles: number[],
  feries: Iterable<string>,
): number {
  const regle = estNature(nature) ? REGLES[nature] : null;
  if (!regle?.decompteSolde) return 0;
  return compterJours(du, au, { mode: reglages.mode, joursTravailles, feries });
}

export interface SoldeAgent {
  agent: Agent;
  solde: SoldeConges;
  /** Absence en cours ou à venir la plus proche, pour situer la personne. */
  prochaine: Absence | null;
  /** Ce qui a été saisi à la main, pour pouvoir le corriger sur place. */
  compteur: { dateEntree: string; dateSortie: string; reporte: number };
}

/**
 * Soldes de congés de tout le personnel actif, à une date.
 *
 * Les jours PRIS sont lus sur `jours_decomptes`, figé à l'acceptation, et
 * non recalculés : recalculer donnerait un autre chiffre le jour où le mode
 * de décompte change, et un solde qui bouge tout seul dans le passé est
 * indéfendable devant la personne concernée.
 */
export async function soldesConges(jusquA: string): Promise<SoldeAgent[]> {
  const [agents, compteurs, parametres, toutes] = await Promise.all([
    lireTout<Agent>("agents", "nom.asc"),
    listCompteurs(),
    listParametresPointage(),
    lireSiPossible<Absence>("absences", "du.asc,id.asc"),
  ]);

  const reglages = reglagesDe(parametres);
  /* L'exercice borne les DEUX côtés du calcul. Compter l'acquisition sur
     l'exercice mais les congés pris sur tout l'historique donnerait un
     solde qui décroît d'année en année sans jamais se recharger. */
  const debutEx = debutExercice(jusquA, reglages.exerciceDebut);
  const parAgent = new Map<string, CompteurConges>(compteurs.map((c) => [c.agent_id, c]));
  const absParAgent = new Map<string, Absence[]>();
  for (const a of toutes) {
    (absParAgent.get(a.agent_id) ?? absParAgent.set(a.agent_id, []).get(a.agent_id)!).push(a);
  }

  return agents
    .filter((a) => a.actif)
    .map((agent) => {
      const compteur = parAgent.get(agent.id);
      /* L'acquisition s'arrête à la sortie. Une personne partie en mars
         continuerait sinon de gagner deux jours et demi par mois pour
         toujours, et son solde de tout repos ferait tache dans le tableau
         sans que personne sache d'où il vient. */
      const sortie = compteur?.date_sortie || "";
      const arret = sortie && sortie < jusquA ? sortie : jusquA;
      const siennes = absParAgent.get(agent.id) ?? [];
      let pris = 0;
      let enAttente = 0;
      for (const a of siennes) {
        if (!estNature(a.nature) || !REGLES[a.nature].decompteSolde) continue;
        // Les exercices clos sont déjà résumés dans `reporte` : les
        // recompter ici retrancherait deux fois les mêmes journées.
        if (a.du < debutEx) continue;
        const n = Number(a.jours_decomptes) || 0;
        if (a.etat === "acceptee") pris += n;
        else if (a.etat === "demande") enAttente += n;
      }
      const aVenir = siennes
        .filter((a) => a.au >= jusquA && (a.etat === "acceptee" || a.etat === "demande"))
        .sort((x, y) => x.du.localeCompare(y.du));
      return {
        agent,
        solde: calculerSolde({
          // Sans date d'entrée saisie, aucun droit ne peut être calculé :
          // on rend un solde à zéro plutôt qu'un chiffre inventé.
          dateEntree: compteur?.date_entree ?? "",
          jusquA: arret,
          joursPris: pris,
          joursEnAttente: enAttente,
          reporte: Number(compteur?.reporte) || 0,
          acquisitionParMois: reglages.acquisitionParMois,
          debutExercice: debutEx,
        }),
        prochaine: aVenir[0] ?? null,
        compteur: {
          dateEntree: compteur?.date_entree ?? "",
          dateSortie: compteur?.date_sortie ?? "",
          reporte: Number(compteur?.reporte) || 0,
        },
      };
    });
}

/**
 * Absences d'une personne qui recouvrent une période donnée.
 *
 * Sert au contrôle anti-doublon : poser deux congés sur les mêmes jours
 * fausserait le solde d'autant.
 */
export function conflits(
  existantes: Absence[],
  periode: { du: string; au: string },
  ignorerId = "",
): Absence[] {
  return existantes.filter(
    (a) =>
      a.id !== ignorerId &&
      (a.etat === "acceptee" || a.etat === "demande") &&
      chevauche(a, periode),
  );
}
