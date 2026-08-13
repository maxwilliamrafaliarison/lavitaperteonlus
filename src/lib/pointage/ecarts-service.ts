/* ============================================================
   POINTAGE — service : confronter le planning aux passages réels
   ============================================================

   Fait le joint entre trois sources qui vivaient jusqu'ici séparément :
   le référentiel des agents, les badgeages, et le planning. Le calcul
   lui-même reste dans `ecarts.ts`, pur et testable ; ce fichier ne fait
   que rassembler ce qu'il faut lui donner à manger.
   ============================================================ */

import { listParametresPlanning, planifiePourAgents } from "@/lib/planning/data";

import { listAgents, listPointages, type Agent } from "./data";
import {
  ecartsDuJour,
  reglagePourPoste,
  agregerEcarts,
  type CreneauDuJour,
  type EcartsJour,
  type PassageSite,
} from "./ecarts";

export interface EcartsAgentJour {
  agent: Agent;
  ecarts: EcartsJour;
  /** Le créneau du jour, tel qu'affiché à la RH ("7H-12H", "REPOS"…). */
  creneauLibelle: string;
}

/**
 * `plagesDuJour` rend des bornes ABSOLUES ("2026-06-04 17:00"), parce
 * qu'une garde franchit minuit. Les écarts, eux, raisonnent en heures du
 * jour civil — c'est la convention des classeurs, qui coupent les gardes à
 * 00:00 et 23:59. On ramène donc la fin au même jour que le début.
 */
function versCreneauDuJour(
  jour: string,
  planifie: { plages: Array<{ debut: string; fin: string }>; lieu: string; creneauId: string } | undefined,
): CreneauDuJour | null {
  if (!planifie) return null;
  if (planifie.plages.length === 0) {
    return { debut: "", fin: "", repos: true, site: planifie.lieu, libelle: planifie.creneauId };
  }
  const heure = (s: string) => s.slice(11, 16);
  const finDeJour = (p: { debut: string; fin: string }) =>
    p.fin.slice(0, 10) === jour ? heure(p.fin) : "23:59";
  const [p1, p2] = planifie.plages;
  return {
    debut: heure(p1.debut),
    fin: finDeJour(p1),
    debut2: p2 ? heure(p2.debut) : undefined,
    fin2: p2 ? finDeJour(p2) : undefined,
    site: planifie.lieu,
    libelle: planifie.creneauId,
  };
}

/**
 * Écarts au planning de tous les agents actifs, pour une journée.
 *
 * Un agent sans affectation ce jour-là n'est pas ignoré : s'il a badgé, il
 * ressort en « hors planning ». C'est l'inverse du réflexe habituel — on
 * cherche autant ce qui manque au planning que ce qui manque au pointage.
 */
export async function ecartsDuJourTousAgents(jour: string): Promise<EcartsAgentJour[]> {
  const [agents, pointages, planifie, parametres] = await Promise.all([
    listAgents(),
    listPointages(jour, jour),
    planifiePourAgents(jour, jour),
    listParametresPlanning(),
  ]);
  const params = new Map(parametres.map((p) => [p.cle, p.valeur]));

  const parAgent = new Map<string, PassageSite[]>();
  for (const p of pointages) {
    const arr = parAgent.get(p.agent_id) ?? [];
    arr.push({ horodatage: p.horodatage, site: p.site_pointage });
    parAgent.set(p.agent_id, arr);
  }

  /* L'heure n'est transmise QUE pour la journée en cours : sur un jour
     révolu, « il est encore au travail » n'a aucun sens. */
  const nowMada = new Date(Date.now() + 3 * 3600 * 1000);
  const maintenant = nowMada.toISOString().slice(0, 10) === jour ? nowMada.toISOString().slice(11, 16) : undefined;

  const out: EcartsAgentJour[] = [];
  for (const agent of agents.filter((a) => a.actif)) {
    const creneau = versCreneauDuJour(jour, planifie.get(agent.id)?.get(jour));
    const passages = parAgent.get(agent.id) ?? [];
    // Ni planning ni passage : la personne n'a rien à voir avec ce jour.
    if (!creneau && passages.length === 0) continue;
    out.push({
      agent,
      ecarts: ecartsDuJour(jour, passages, creneau, reglagePourPoste(agent.poste ?? "", params), maintenant),
      creneauLibelle: creneau?.repos
        ? "Repos"
        : creneau
          ? `${creneau.debut}–${creneau.fin}${creneau.debut2 ? ` / ${creneau.debut2}–${creneau.fin2}` : ""}`
          : "",
    });
  }

  /* À l'écran, ce qui cloche passe devant : la RH ouvre cette page pour
     traiter des exceptions, pas pour relire soixante lignes conformes. */
  const rang: Record<string, number> = {
    retard_et_sortie: 0,
    retard: 1,
    sortie_anticipee: 2,
    a_verifier: 3,
    hors_planning: 4,
    sans_badge: 5,
    en_cours: 6,
    a_venir: 7,
    conforme: 8,
    repos: 9,
  };
  return out.sort(
    (a, b) =>
      (rang[a.ecarts.etat] ?? 9) - (rang[b.ecarts.etat] ?? 9) ||
      b.ecarts.retardMinutes - a.ecarts.retardMinutes ||
      (a.agent.prenom || "").localeCompare(b.agent.prenom || ""),
  );
}

/** Écarts d'un agent sur une période, pour sa fiche et l'état mensuel. */
export async function ecartsPeriodeAgent(agentId: string, du: string, au: string) {
  const [pointages, planifie, parametres, agents] = await Promise.all([
    listPointages(du, au),
    planifiePourAgents(du, au),
    listParametresPlanning(),
    listAgents(),
  ]);
  const agent = agents.find((a) => a.id === agentId);
  const params = new Map(parametres.map((p) => [p.cle, p.valeur]));
  const reglage = reglagePourPoste(agent?.poste ?? "", params);
  const jours = planifie.get(agentId);

  const parJour = new Map<string, PassageSite[]>();
  for (const p of pointages) {
    if (p.agent_id !== agentId) continue;
    const arr = parJour.get(p.jour) ?? [];
    arr.push({ horodatage: p.horodatage, site: p.site_pointage });
    parJour.set(p.jour, arr);
  }

  const tousJours = [...new Set([...(jours?.keys() ?? []), ...parJour.keys()])].sort();
  const ecarts = tousJours.map((j) =>
    ecartsDuJour(j, parJour.get(j) ?? [], versCreneauDuJour(j, jours?.get(j)), reglage),
  );
  return { agent, ecarts, total: agregerEcarts(ecarts), reglage };
}
