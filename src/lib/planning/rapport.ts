import { planifiePourAgents } from "./data";
import { etatMensuel } from "@/lib/pointage/data";
import { versHeures } from "@/lib/pointage/calcul";

/* ============================================================
   ÉTAT PLANIFIÉ / RÉALISÉ — agrégation
   ============================================================
   Le document que la direction et le service RH éditent à la demande :
   ce qui était prévu, ce qui a été fait, et l'écart entre les deux.

   ── UNE PRÉCAUTION DE LECTURE INSCRITE DANS LES DONNÉES ──────────────────
   Un écart négatif ne signifie pas qu'un agent a manqué à ses heures : il
   peut tout aussi bien signaler des badgeages absents (export tronqué,
   pointeuse non relevée). Chaque ligne porte donc son nombre d'anomalies et
   de jours sans aucun pointage, pour que le lecteur distingue un problème de
   présence d'un problème de collecte. Un état qui ne dirait que « −130 h »
   conduirait à des reproches injustes.
   ============================================================ */

export interface LigneEtat {
  agentId: string;
  nom: string;
  site: string;
  statut: string;
  minutesPlanifiees: number;
  minutesRealisees: number;
  ecartMinutes: number;
  joursPlanifies: number;
  joursTravailles: number;
  /** Jours planifiés sans le moindre pointage — indice de collecte manquante. */
  joursSansPointage: number;
  anomalies: number;
  minutesRetard: number;
  minutesSup: number;
}

export interface EtatPlanifieRealise {
  du: string;
  au: string;
  moisLabel: string;
  lignes: LigneEtat[];
  // Totaux
  totalPlanifie: number;
  totalRealise: number;
  totalEcart: number;
  nbAgents: number;
  nbAgentsPlanifies: number;
  totalAnomalies: number;
  totalJoursSansPointage: number;
  /** Part des jours planifiés sans aucun pointage, en %. */
  tauxCollecte: number;
  parSite: Array<{ site: string; planifie: number; realise: number; agents: number }>;
}

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export function libelleMois(du: string): string {
  const [a, m] = du.split("-");
  return `${MOIS_FR[Number(m) - 1] ?? m} ${a}`;
}

export async function buildEtatPlanifieRealise(du: string, au: string): Promise<EtatPlanifieRealise> {
  const [plan, etats] = await Promise.all([planifiePourAgents(du, au), etatMensuel(du, au)]);

  const lignes: LigneEtat[] = [];
  for (const e of etats) {
    const p = plan.get(e.agent.id);
    const minutesPlanifiees = p ? [...p.values()].reduce((s, j) => s + j.minutes, 0) : 0;
    const joursPlanifies = p ? [...p.values()].filter((j) => j.minutes > 0).length : 0;
    const minutesRealisees = e.total.minutesTravaillees;

    // Jours planifiés travaillés pour lesquels aucun pointage n'existe.
    let joursSansPointage = 0;
    if (p) {
      const realisesParJour = new Map(e.journees.map((j) => [j.jour, j]));
      for (const [jour, prev] of p) {
        if (prev.minutes <= 0) continue;
        const r = realisesParJour.get(jour);
        if (!r || (r.plages.length === 0 && !r.typeAbsence)) joursSansPointage++;
      }
    }

    if (minutesPlanifiees === 0 && minutesRealisees === 0) continue;
    lignes.push({
      agentId: e.agent.id,
      nom: `${e.agent.prenom} ${e.agent.nom}`.trim() || e.agent.id,
      site: e.agent.site,
      statut: e.agent.statut,
      minutesPlanifiees,
      minutesRealisees,
      ecartMinutes: minutesRealisees - minutesPlanifiees,
      joursPlanifies,
      joursTravailles: e.total.joursTravailles,
      joursSansPointage,
      anomalies: e.total.nbAnomalies,
      minutesRetard: e.total.minutesRetard,
      minutesSup: e.total.minutesSupProposees,
    });
  }

  lignes.sort((a, b) => b.minutesPlanifiees - a.minutesPlanifiees || a.nom.localeCompare(b.nom));

  const totalPlanifie = lignes.reduce((s, l) => s + l.minutesPlanifiees, 0);
  const totalRealise = lignes.reduce((s, l) => s + l.minutesRealisees, 0);
  const totalJours = lignes.reduce((s, l) => s + l.joursPlanifies, 0);
  const totalSansPointage = lignes.reduce((s, l) => s + l.joursSansPointage, 0);

  const sites = new Map<string, { planifie: number; realise: number; agents: number }>();
  for (const l of lignes) {
    const s = sites.get(l.site) ?? { planifie: 0, realise: 0, agents: 0 };
    s.planifie += l.minutesPlanifiees;
    s.realise += l.minutesRealisees;
    s.agents++;
    sites.set(l.site, s);
  }

  return {
    du,
    au,
    moisLabel: libelleMois(du),
    lignes,
    totalPlanifie,
    totalRealise,
    totalEcart: totalRealise - totalPlanifie,
    nbAgents: lignes.length,
    nbAgentsPlanifies: lignes.filter((l) => l.minutesPlanifiees > 0).length,
    totalAnomalies: lignes.reduce((s, l) => s + l.anomalies, 0),
    totalJoursSansPointage: totalSansPointage,
    tauxCollecte: totalJours > 0 ? ((totalJours - totalSansPointage) / totalJours) * 100 : 100,
    parSite: [...sites.entries()].map(([site, v]) => ({ site, ...v })).sort((a, b) => b.planifie - a.planifie),
  };
}

/** Écart signé, lisible : « +2:30 », « −13:45 », « — ». */
export function fmtEcart(minutes: number): string {
  if (minutes === 0) return "—";
  return `${minutes > 0 ? "+" : "−"}${versHeures(Math.abs(minutes))}`;
}
