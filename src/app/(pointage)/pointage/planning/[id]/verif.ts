import { affectationsPeriode, listCreneaux as _listCreneaux } from "@/lib/planning/data";
import { dureeCreneau, plagesDuJour, verifierSeuils, type AlerteLegale } from "@/lib/planning/creneau";

export const listCreneaux = _listCreneaux;

/** Une alerte, rattachée à la personne qu'elle concerne. */
export interface AlerteAgent extends AlerteLegale {
  agentId: string;
  agentNom: string;
}

/** Journées d'un agent, prêtes pour le contrôle des seuils. */
function journeesDe(
  affectations: Array<{ agent_id: string; jour: string; creneau_id: string; debut: string; fin: string }>,
  parCreneau: Map<string, Parameters<typeof dureeCreneau>[0] & { debut2: string; fin2: string }>,
  agentId: string,
) {
  return affectations
    .filter((a) => a.agent_id === agentId)
    .map((a) => {
      const c = parCreneau.get(a.creneau_id);
      if (!c) return null;
      /* Même règle que dans `planifiePourAgents` : un horaire dérogatoire
         décrit TOUTE la journée, il ne se superpose pas à la coupure du
         modèle. Sans `debut2`/`fin2` vidés, l'après-midi serait compté deux
         fois et le plafond hebdomadaire sauterait à tort. */
      const eff = a.debut && a.fin ? { ...c, debut: a.debut, fin: a.fin, debut2: "", fin2: "", minutes: 0 } : c;
      return { jour: a.jour, plages: plagesDuJour(a.jour, eff), minutes: dureeCreneau(eff) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
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

  const [affectations, creneaux] = await Promise.all([
    affectationsPeriode(decale(-7), decale(7)),
    listCreneaux(),
  ]);
  const parCreneau = new Map(creneaux.map((c) => [c.id, c]));
  return verifierSeuils(journeesDe(affectations, parCreneau, agentId));
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
): Promise<AlerteAgent[]> {
  const decale = (jour: string, n: number) => {
    const d = new Date(`${jour}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const [affectations, creneaux] = await Promise.all([
    affectationsPeriode(decale(du, -7), decale(au, 7)),
    listCreneaux(),
  ]);
  const parCreneau = new Map(creneaux.map((c) => [c.id, c]));

  const out: AlerteAgent[] = [];
  for (const agentId of new Set(affectations.map((a) => a.agent_id))) {
    for (const alerte of verifierSeuils(journeesDe(affectations, parCreneau, agentId))) {
      /* On ne remonte que ce qui touche la fenêtre affichée : signaler un
         dépassement d'une semaine qu'on ne voit pas laisserait le lecteur
         sans moyen d'agir. */
      if (alerte.jour && (alerte.jour < du || alerte.jour > au)) continue;
      out.push({ ...alerte, agentId, agentNom: nomDe(agentId) });
    }
  }
  // Le bloquant d'abord : c'est ce qui empêche de publier.
  return out.sort(
    (a, b) => Number(b.bloquant) - Number(a.bloquant) || (a.jour ?? "").localeCompare(b.jour ?? ""),
  );
}
