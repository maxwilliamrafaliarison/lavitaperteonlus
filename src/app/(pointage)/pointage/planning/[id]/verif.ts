import {
  affectationsPeriode,
  listCreneaux as _listCreneaux,
  listParametresPlanning,
} from "@/lib/planning/data";
import { listAbsences, indexerAbsences } from "@/lib/pointage/absences-data";
import {
  plagesDuJour,
  verifierSeuils,
  seuilsDepuisParametres,
  type AlerteLegale,
  type PlageAbsolue,
} from "@/lib/planning/creneau";

export const listCreneaux = _listCreneaux;

/**
 * Préfixe des POSTES À POURVOIR — une affectation sans titulaire.
 *
 * Il vit ici plutôt que dans `actions.ts` : un module « use server » ne peut
 * exporter que des fonctions, chacune devenant un point d'entrée HTTP. Une
 * constante y est refusée à la compilation, et c'est une bonne règle.
 */
export const PREFIXE_ATTENTE = "__attente-";

/** Une alerte, rattachée à la personne qu'elle concerne. */
export interface AlerteAgent extends AlerteLegale {
  agentId: string;
  agentNom: string;
}

/**
 * Réunit des plages qui se chevauchent ou se touchent, et rend leur durée.
 *
 * Une même personne peut tenir DEUX SERVICES le même jour — Lida est aux
 * vaccins et à la pharmacie le 10 août, et quinze cas existent sur la seule
 * semaine du 10. Chaque affectation portant ses propres plages, les traiter
 * séparément revenait à croire qu'elle travaille deux journées : le contrôle
 * annonçait « 0:00 de repos entre deux services » — entre elle et elle-même —
 * et comptait ses heures en double, jusqu'à faire sauter le plafond
 * hebdomadaire sur des semaines parfaitement normales.
 *
 * Soixante et une alertes « bloquantes » sur une semaine sans qu'aucune ne
 * soit vraie : c'est ainsi qu'on apprend à ne plus lire un panneau d'alertes.
 */
function fusionnerPlages(plages: PlageAbsolue[]): { plages: PlageAbsolue[]; minutes: number } {
  const tri = [...plages].sort((a, b) => a.debut.localeCompare(b.debut));
  const out: PlageAbsolue[] = [];
  for (const p of tri) {
    const dernier = out[out.length - 1];
    if (dernier && p.debut <= dernier.fin) {
      if (p.fin > dernier.fin) dernier.fin = p.fin;
      continue;
    }
    out.push({ ...p });
  }
  const minutes = out.reduce((s, p) => {
    const a = Date.parse(`${p.debut.replace(" ", "T")}:00Z`);
    const b = Date.parse(`${p.fin.replace(" ", "T")}:00Z`);
    return s + (Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.max(0, (b - a) / 60000));
  }, 0);
  return { plages: out, minutes };
}

/** Journées d'un agent, prêtes pour le contrôle des seuils. */
function journeesDe(
  affectations: Array<{ agent_id: string; jour: string; creneau_id: string; debut: string; fin: string }>,
  parCreneau: Map<string, { type: string; debut: string; fin: string; debut2: string; fin2: string; minutes: number }>,
  agentId: string,
) {
  /* UNE JOURNÉE, PAS UNE AFFECTATION. On regroupe par date avant de juger :
     deux services tenus le même jour font une seule journée de travail. */
  const parJour = new Map<string, PlageAbsolue[]>();
  for (const a of affectations.filter((x) => x.agent_id === agentId)) {
    const c = parCreneau.get(a.creneau_id);
    if (!c) continue;
      /* Même règle que dans `planifiePourAgents` : un horaire dérogatoire
         décrit TOUTE la journée, il ne se superpose pas à la coupure du
         modèle. Sans `debut2`/`fin2` vidés, l'après-midi serait compté deux
         fois et le plafond hebdomadaire sauterait à tort. */
    const eff = a.debut && a.fin ? { ...c, debut: a.debut, fin: a.fin, debut2: "", fin2: "", minutes: 0 } : c;
    parJour.set(a.jour, [...(parJour.get(a.jour) ?? []), ...plagesDuJour(a.jour, eff)]);
  }
  return [...parJour.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([jour, plages]) => ({ jour, ...fusionnerPlages(plages) }));
}

/**
 * Contrôle les seuils légaux autour d'un jour modifié.
 *
 * On regarde une fenêtre de 15 jours centrée sur la modification : le repos
 * journalier se juge par rapport à la veille et au lendemain, et le plafond
 * hebdomadaire sur 7 jours glissants. Recalculer tout le mois à chaque
 * cellule saisie serait inutilement coûteux.
 *
 * Rend les alertes ENTIÈRES, drapeau `bloquant` compris. L'appelant décidait
 * jusqu'ici d'en afficher la première dans une notification fugace : c'est
 * l'inverse de ce qu'il faut faire d'un contrôle légal, dont la valeur tient
 * précisément à ce qu'on puisse le relire.
 */
export async function verifierSeuilsAgent(agentId: string, jour: string): Promise<AlerteLegale[]> {
  const decale = (n: number) => {
    const d = new Date(`${jour}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const [affectations, creneaux, parametres] = await Promise.all([
    affectationsPeriode(decale(-7), decale(7)),
    listCreneaux(),
    listParametresPlanning(),
  ]);
  const parCreneau = new Map(creneaux.map((c) => [c.id, c]));
  const seuils = seuilsDepuisParametres(new Map(parametres.map((p) => [p.cle, p.valeur])));
  return verifierSeuils(journeesDe(affectations, parCreneau, agentId), seuils);
}

/**
 * Contrôle TOUS les agents affectés sur la fenêtre affichée.
 *
 * C'est ce que la grille doit montrer en permanence, et non seulement après
 * une saisie : une semaine reprise de la précédente peut être illégale sans
 * qu'on y ait touché une seule cellule. Le contrôle déborde de sept jours de
 * chaque côté — un repos entre deux nuits se juge sur la nuit d'avant, même
 * si elle tombe hors de l'écran.
 */
export async function verifierFenetre(
  du: string,
  au: string,
  nomDe: (agentId: string) => string,
  /** Les agents à contrôler — ceux du centre affiché, et eux seuls. */
  agents?: string[],
): Promise<AlerteAgent[]> {
  const decale = (jour: string, n: number) => {
    const d = new Date(`${jour}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  /* La fenêtre de contrôle est BORNÉE. Sur une vue de six mois, déborder de
     sept jours de chaque côté ferait lire deux cents jours d'affectations
     pour un panneau que personne ne lit à cette échelle. Au-delà d'un mois,
     on contrôle le premier mois et on le dit. */
  const MAX_JOURS = 31;
  const finUtile =
    (Date.parse(`${au}T12:00:00Z`) - Date.parse(`${du}T12:00:00Z`)) / 86400000 > MAX_JOURS
      ? decale(du, MAX_JOURS)
      : au;

  const [affectations, creneaux, parametres, absences] = await Promise.all([
    affectationsPeriode(decale(du, -7), decale(finUtile, 7), agents),
    listCreneaux(),
    listParametresPlanning(),
    listAbsences(du, finUtile),
  ]);
  const parCreneau = new Map(creneaux.map((c) => [c.id, c]));
  /* Les seuils viennent de la BASE : le centre est régi par le droit
     malgache, et la valeur d'un plafond légal n'a rien à faire dans du
     code compilé. */
  const seuils = seuilsDepuisParametres(new Map(parametres.map((p) => [p.cle, p.valeur])));

  const out: AlerteAgent[] = [];

  /* AFFECTÉ ALORS QU'IL SERA ABSENT. C'est l'erreur que le module des congés
     existe pour empêcher : le planning se fait le vendredi pour la semaine
     suivante, et sans ce contrôle on découvre le lundi matin que la personne
     inscrite est en congé depuis trois jours.

     Le contrôle est un point de VIGILANCE, pas un blocage. Un congé peut être
     annulé, et la personne peut avoir accepté de revenir : c'est au
     responsable de trancher, pas à l'outil d'interdire. Une mission ne
     déclenche rien, puisque la personne travaille, simplement ailleurs. */
  const absencesParJour = indexerAbsences(absences);
  const dejaSignale = new Set<string>();
  for (const a of affectations) {
    if (a.agent_id.startsWith(PREFIXE_ATTENTE)) continue;
    const c = parCreneau.get(a.creneau_id);
    if (!c || c.type === "repos") continue;
    const abs = absencesParJour.get(`${a.agent_id}|${a.jour}`);
    if (!abs || abs.compteCommeTravail) continue;
    if (a.jour < du || a.jour > finUtile) continue;
    const cle = `${a.agent_id}|${a.jour}`;
    if (dejaSignale.has(cle)) continue;
    dejaSignale.add(cle);
    out.push({
      jour: a.jour,
      regle: "absence",
      message: `${nomDe(a.agent_id)} est affecté alors qu'une absence est accordée ce jour-là (${abs.libelle})`,
      bloquant: false,
      agentId: a.agent_id,
      agentNom: nomDe(a.agent_id),
    });
  }
  for (const agentId of new Set(affectations.map((a) => a.agent_id))) {
    /* Un poste à pourvoir n'a pas de titulaire : lui appliquer le repos de
       onze heures ferait alerter sur une personne qui n'existe pas. */
    if (agentId.startsWith(PREFIXE_ATTENTE)) continue;
    for (const alerte of verifierSeuils(journeesDe(affectations, parCreneau, agentId), seuils)) {
      /* On ne remonte que ce qui touche la fenêtre affichée : signaler un
         dépassement d'une semaine qu'on ne voit pas laisserait le lecteur
         sans moyen d'agir. */
      if (alerte.jour && (alerte.jour < du || alerte.jour > finUtile)) continue;
      out.push({ ...alerte, agentId, agentNom: nomDe(agentId) });
    }
  }
  // Le bloquant d'abord : c'est ce qui empêche de publier.
  return out.sort(
    (a, b) => Number(b.bloquant) - Number(a.bloquant) || (a.jour ?? "").localeCompare(b.jour ?? ""),
  );
}
