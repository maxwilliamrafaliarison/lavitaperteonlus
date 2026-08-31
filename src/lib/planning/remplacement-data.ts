import { listAbsences, indexerAbsences, moduleAbsencesInstalle } from "@/lib/pointage/absences-data";
import { listAgents, nomAffiche, rattacheA, type Agent } from "@/lib/pointage/data";

import {
  affectationsPeriode,
  listCreneaux,
  listParametresPlanning,
  listPlannings,
  listServices,
  type Affectation,
  type Planning,
} from "./data";
import { seuilsDepuisParametres } from "./creneau";
import { estPosteAPourvoir } from "./constantes";
import {
  classerCandidats,
  indexerExperience,
  type AffectationSimple,
  type Besoin,
  type Candidat,
  type CreneauModele,
} from "./remplacement";

/* ============================================================
   REMPLACEMENTS — assemblage des données
   ============================================================
   Le classement reste dans remplacement.ts, module pur et testé. Ici on lit
   la base, on repère les trous, et on appelle le moteur.
   ============================================================ */

/** Combien de jours d'historique servent à mesurer l'expérience. */
const JOURS_HISTORIQUE = 120;

function decaler(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface Couverture {
  besoins: BesoinAffiche[];
  /**
   * Le module des congés répond-il ?
   *
   * Sans lui, la moitié des trous est invisible : un poste tenu par
   * quelqu'un qui sera absent a l'air parfaitement pourvu. L'écran doit
   * donc pouvoir distinguer « rien à couvrir » de « je ne vois pas les
   * absences », faute de quoi il rassure à tort, ce qui est pire qu'une
   * panne annoncée.
   */
  absencesLisibles: boolean;
}

export interface BesoinAffiche {
  /** Identifiant de l'affectation à réattribuer. */
  affectationId: string;
  planningId: string;
  planningLibelle: string;
  planningPublie: boolean;
  besoin: Besoin;
  creneauLibelle: string;
  candidats: Candidat[];
}

const versSimple = (a: Affectation): AffectationSimple => ({
  agent_id: a.agent_id,
  jour: a.jour,
  creneau_id: a.creneau_id,
  service_id: a.service_id,
  debut: a.debut,
  fin: a.fin,
});

/**
 * Les postes à couvrir sur une période, avec leurs remplaçants possibles.
 *
 * ── DEUX FAÇONS DE MANQUER QUELQU'UN ─────────────────────────────────────
 * Un poste peut être VIDE, parce qu'on l'a ouvert sans savoir qui le
 * tiendrait : le planning porte alors une affectation dont le titulaire est
 * fictif. Ou bien il peut être POURVU PAR QUELQU'UN QUI SERA ABSENT, ce que
 * seul le croisement avec les congés révèle, et qui est le cas le plus
 * dangereux : rien ne le signale à l'œil, la case est remplie.
 *
 * Les deux produisent le même besoin, et se traitent du même geste.
 *
 * ── LA MISSION N'EN EST PAS UN ───────────────────────────────────────────
 * Une personne en mission travaille : elle n'est pas au centre, mais son
 * poste n'est pas à couvrir par quelqu'un d'autre. La confondre avec un
 * congé remplirait l'écran de faux trous, et un écran de faux trous cesse
 * d'être lu.
 */
export async function besoinsDeCouverture(du: string, au: string): Promise<Couverture> {
  /* Le contexte de contrôle déborde de sept jours de chaque côté : un repos
     de onze heures se juge sur la veille et le lendemain, qui peuvent tomber
     hors de la période affichée. On lit donc la fenêtre ÉLARGIE une seule
     fois, et la période affichée s'en déduit : demander les deux au serveur
     ferait deux fois le même travail, la seconde étant incluse dans la
     première. */
  const [fenetre, historique, creneaux, services, agents, plannings, parametres, absences, absencesLisibles] =
    await Promise.all([
      affectationsPeriode(decaler(du, -7), decaler(au, 7)),
      /* L'historique ne sert qu'à mesurer l'expérience : il n'entre PAS dans
         le contexte de contrôle, sinon les seuils se jugeraient sur quatre
         mois. Il s'arrête à J-8 et non à J-1 : la fenêtre de contrôle
         commence à J-7, et les deux se recouvraient sur ces sept jours, ce
         qui comptait DEUX FOIS l'expérience récente. Une personne ayant tenu
         le poste hier valait ainsi deux personnes l'ayant tenu il y a un
         mois, et l'ordre proposé penchait vers celle qu'on venait déjà de
         solliciter. */
      affectationsPeriode(decaler(du, -JOURS_HISTORIQUE), decaler(du, -8)),
      listCreneaux(),
      listServices(),
      listAgents(),
      listPlannings(),
      listParametresPlanning(),
      listAbsences(du, au),
      moduleAbsencesInstalle(),
    ]);

  const parCreneau = new Map<string, CreneauModele>(
    creneaux.map((c) => [
      c.id,
      {
        id: c.id,
        libelle: c.libelle,
        type: c.type,
        debut: c.debut,
        fin: c.fin,
        debut2: c.debut2,
        fin2: c.fin2,
        minutes: Number(c.minutes) || 0,
      },
    ]),
  );
  const libelleService = new Map(services.map((s) => [s.id, s.libelle]));
  const parPlanning = new Map<string, Planning>(plannings.map((p) => [p.id, p]));

  /* LES PLANNINGS ARCHIVÉS NE COMPTENT PLUS. Ils décrivent une organisation
     remplacée depuis, et un centre garde souvent une ancienne version aux
     mêmes dates. Les laisser passer produirait des trous imaginaires sur une
     semaine déjà couverte, et compterait deux fois les heures d'une même
     personne dans le contrôle des seuils, jusqu'à la déclarer indisponible
     pour un travail qu'elle ne fait pas. */
  const vivant = (a: Affectation) => parPlanning.get(a.planning_id)?.statut !== "archive";
  const parAgent = new Map<string, Agent>(agents.map((a) => [a.id, a]));
  const absencesIndex = indexerAbsences(absences);
  const seuils = seuilsDepuisParametres(new Map(parametres.map((p) => [p.cle, p.valeur])));

  const candidatsPossibles = agents
    .filter((a) => a.actif)
    .map((a) => ({
      id: a.id,
      nom: nomAffiche(a),
      site: a.site,
      statut: a.statut,
      poste: a.poste,
      actif: a.actif,
    }));

  const affectationsContexte = fenetre.filter(vivant).map(versSimple);
  const historiqueContexte = historique.filter(vivant).map(versSimple);

  const contexte = {
    affectations: affectationsContexte,
    historique: historiqueContexte,
    // Un seul parcours des quatre mois, partagé par tous les trous.
    experience: indexerExperience(
      [...historiqueContexte, ...affectationsContexte],
      parCreneau,
    ),
    creneaux: parCreneau,
    absences: new Map(
      [...absencesIndex.entries()].map(([cle, info]) => [cle, info.libelle] as const),
    ),
    seuils,
    rattacheA,
  };

  const out: BesoinAffiche[] = [];

  /* La période affichée se découpe dans la fenêtre élargie déjà lue. */
  const affectations = fenetre.filter((a) => a.jour >= du && a.jour <= au && vivant(a));

  for (const a of affectations) {
    const creneau = parCreneau.get(a.creneau_id);
    // Un repos n'a personne à remplacer, et un créneau inconnu ne se juge pas.
    if (!creneau || creneau.type === "repos") continue;

    const plan = parPlanning.get(a.planning_id);
    const centre = plan?.centre ?? "REX";

    const posteVide = estPosteAPourvoir(a.agent_id);
    const absence = posteVide ? undefined : absencesIndex.get(`${a.agent_id}|${a.jour}`);
    // Une mission est du travail : le poste n'est pas à couvrir.
    if (!posteVide && (!absence || absence.compteCommeTravail)) continue;

    const agentRemplace = posteVide ? undefined : parAgent.get(a.agent_id);

    const besoin: Besoin = {
      jour: a.jour,
      creneauId: a.creneau_id,
      serviceId: a.service_id,
      posteLibelle:
        libelleService.get(a.service_id) || a.lieu || creneau.libelle || "Poste",
      lieu: a.lieu,
      centre,
      motif: posteVide ? "poste_vide" : "absence",
      agentRemplaceId: posteVide ? "" : a.agent_id,
      agentRemplaceNom: agentRemplace ? nomAffiche(agentRemplace) : "",
      natureAbsence: absence?.libelle ?? "",
      // L'affectation est transférée telle quelle : ses horaires
      // dérogatoires suivent le poste, ils ne restent pas au titulaire.
      debut: a.debut,
      fin: a.fin,
    };

    out.push({
      affectationId: a.id,
      planningId: a.planning_id,
      planningLibelle: plan?.libelle ?? a.planning_id,
      planningPublie: plan?.statut === "publie",
      besoin,
      creneauLibelle: creneau.libelle || creneau.id,
      candidats: classerCandidats(besoin, candidatsPossibles, contexte),
    });
  }

  /* Le plus proche d'abord : un trou de demain se comble aujourd'hui, un
     trou dans trois semaines attendra. À date égale, les postes vides
     passent devant les remplacements, parce que personne du tout est pire
     que quelqu'un qui a prévenu. */
  out.sort(
    (x, y) =>
      x.besoin.jour.localeCompare(y.besoin.jour) ||
      Number(y.besoin.motif === "poste_vide") - Number(x.besoin.motif === "poste_vide") ||
      x.besoin.posteLibelle.localeCompare(y.besoin.posteLibelle),
  );
  return { besoins: out, absencesLisibles };
}
