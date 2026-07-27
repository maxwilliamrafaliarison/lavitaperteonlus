import { affectationsPeriode, listCreneaux as _listCreneaux } from "@/lib/planning/data";
import { dureeCreneau, plagesDuJour, verifierSeuils } from "@/lib/planning/creneau";

export const listCreneaux = _listCreneaux;

/**
 * Contrôle les seuils légaux autour d'un jour modifié.
 *
 * On regarde une fenêtre de 15 jours centrée sur la modification : le repos
 * journalier se juge par rapport à la veille et au lendemain, et le plafond
 * hebdomadaire sur 7 jours glissants. Recalculer tout le mois à chaque
 * cellule saisie serait inutilement coûteux.
 */
export async function verifierSeuilsAgent(agentId: string, jour: string): Promise<string[]> {
  const decale = (n: number) => {
    const d = new Date(`${jour}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const [affectations, creneaux] = await Promise.all([
    affectationsPeriode(decale(-7), decale(7)),
    listCreneaux(),
  ]);
  const parCreneau = new Map(creneaux.map((c) => [c.id, c]));

  const journees = affectations
    .filter((a) => a.agent_id === agentId)
    .map((a) => {
      const c = parCreneau.get(a.creneau_id);
      if (!c) return null;
      const eff = a.debut && a.fin ? { ...c, debut: a.debut, fin: a.fin, minutes: 0 } : c;
      return { jour: a.jour, plages: plagesDuJour(a.jour, eff), minutes: dureeCreneau(eff) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return verifierSeuils(journees).map((a) => a.message);
}
