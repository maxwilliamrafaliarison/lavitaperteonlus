"use client";

import * as React from "react";

import { PlanningEdt, type EdtProps, type GroupeEdt } from "./edt";
import { RoulettePersonnel } from "./roulette-personnel";

/* ============================================================
   PLANNING INDIVIDUEL — roulette à gauche, une seule grille à droite
   ============================================================
   Demande du responsable : n'afficher QU'UN planning hebdomadaire à la
   fois, la personne se choisissant dans une roulette à gauche du tableau.

   Toutes les données de la fenêtre sont déjà chargées : changer de personne
   ne recharge rien, la grille bascule instantanément. L'URL est tenue à
   jour en silence (history.replaceState) pour qu'une vue reste partageable
   par lien, sans déclencher de navigation serveur à chaque cran de roulette.
   ============================================================ */

export function EdtSolo({
  groupes,
  selectionInitiale,
  ...edt
}: Omit<EdtProps, "groupes"> & {
  groupes: GroupeEdt[];
  selectionInitiale: string;
}) {
  const [agentId, setAgentId] = React.useState(
    () => (groupes.some((g) => g.agents[0]?.id === selectionInitiale) ? selectionInitiale : (groupes[0]?.agents[0]?.id ?? "")),
  );

  const personnes = groupes.map((g) => ({
    id: g.agents[0].id,
    nom: g.agents[0].nom,
    statut: g.agents[0].statut,
  }));
  const groupeChoisi = groupes.find((g) => g.agents[0]?.id === agentId) ?? groupes[0];

  function choisir(id: string) {
    setAgentId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("agent", id);
    window.history.replaceState(null, "", url.toString());
  }

  if (!groupeChoisi) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Aucun agent actif.</p>;
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <RoulettePersonnel personnes={personnes} selection={agentId} onChoisir={choisir} />
      <div className="min-w-0 flex-1">
        <PlanningEdt {...edt} groupes={[groupeChoisi]} />
      </div>
    </div>
  );
}
