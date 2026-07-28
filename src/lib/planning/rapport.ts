import { etatMensuel, nomAffiche } from "@/lib/pointage/data";
import { planifiePourAgents } from "./data";
import { versHeures } from "@/lib/pointage/calcul";

/* ============================================================
   ÉTAT PLANIFIÉ / RÉALISÉ — agrégation
   ============================================================
   Le livrable attendu par la direction : ce qui était prévu, ce qui a été
   fait, et l'écart. C'est l'aboutissement du rapprochement entre les deux
   sources — les plannings d'un côté, les badgeages de l'autre.
   ============================================================ */

export interface LignePlanifie {
  agentId: string;
  nom: string;
  site: string;
  statut: string;
  minutesPlanifiees: number;
  minutesRealisees: number;
  ecartMinutes: number;
  joursPlanifies: number;
  joursTravailles: number;
  minutesRetard: number;
  minutesSup: number;
  nbAnomalies: number;
}

export interface EtatPlanifieData {
  du: string;
  au: string;
  moisLabel: string;
  lignes: LignePlanifie[];
  // Totaux
  totalPlanifie: number;
  totalRealise: number;
  totalEcart: number;
  nbAgents: number;
  nbAgentsPlanifies: number;
  totalAnomalies: number;
  parSite: Array<{ site: string; planifie: number; realise: number; agents: number }>;
  /** Part du planifié effectivement retrouvée dans les pointages (%). */
  tauxCollecte: number;
  /** Vrai si la couverture des pointages paraît incomplète. */
  couvertureDouteuse: boolean;
}

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export async function buildEtatPlanifieRealise(du: string, au: string): Promise<EtatPlanifieData> {
  const [etats, plan] = await Promise.all([etatMensuel(du, au), planifiePourAgents(du, au)]);

  const lignes: LignePlanifie[] = etats
    .map((e) => {
      const p = plan.get(e.agent.id);
      const minutesPlanifiees = p ? [...p.values()].reduce((s, j) => s + j.minutes, 0) : 0;
      const joursPlanifies = p ? [...p.values()].filter((j) => j.minutes > 0).length : 0;
      return {
        agentId: e.agent.id,
        nom: nomAffiche(e.agent) || e.agent.id,
        site: e.agent.site,
        statut: e.agent.statut,
        minutesPlanifiees,
        minutesRealisees: e.total.minutesTravaillees,
        ecartMinutes: e.total.minutesTravaillees - minutesPlanifiees,
        joursPlanifies,
        joursTravailles: e.total.joursTravailles,
        minutesRetard: e.total.minutesRetard,
        minutesSup: e.total.minutesSupProposees,
        nbAnomalies: e.total.nbAnomalies,
      };
    })
    .filter((l) => l.minutesPlanifiees > 0 || l.minutesRealisees > 0)
    .sort((a, b) => b.minutesPlanifiees - a.minutesPlanifiees || b.minutesRealisees - a.minutesRealisees);

  const totalPlanifie = lignes.reduce((s, l) => s + l.minutesPlanifiees, 0);
  const totalRealise = lignes.reduce((s, l) => s + l.minutesRealisees, 0);

  const sites = new Map<string, { planifie: number; realise: number; agents: number }>();
  for (const l of lignes) {
    const s = sites.get(l.site) ?? { planifie: 0, realise: 0, agents: 0 };
    s.planifie += l.minutesPlanifiees;
    s.realise += l.minutesRealisees;
    s.agents++;
    sites.set(l.site, s);
  }

  const [an, mo] = du.split("-").map(Number);

  return {
    du,
    au,
    moisLabel: `${MOIS_FR[mo - 1] ?? mo} ${an}`,
    lignes,
    totalPlanifie,
    totalRealise,
    totalEcart: totalRealise - totalPlanifie,
    nbAgents: lignes.length,
    nbAgentsPlanifies: lignes.filter((l) => l.minutesPlanifiees > 0).length,
    totalAnomalies: lignes.reduce((s, l) => s + l.nbAnomalies, 0),
    parSite: [...sites.entries()].map(([site, v]) => ({ site, ...v })).sort((a, b) => b.planifie - a.planifie),
    // Un réalisé très inférieur au planifié traduit presque toujours des
    // badgeages manquants plutôt qu'un absentéisme massif : les exports
    // ZKAccess sont plafonnés à 500 lignes. Mieux vaut le dire dans le
    // document que laisser la direction en tirer une conclusion fausse.
    tauxCollecte: totalPlanifie > 0 ? (totalRealise / totalPlanifie) * 100 : 100,
    couvertureDouteuse: totalPlanifie > 0 && totalRealise < totalPlanifie * 0.6,
  };
}

export const fmtEcart = (minutes: number): string =>
  `${minutes >= 0 ? "+" : "−"}${versHeures(Math.abs(minutes))}`;
