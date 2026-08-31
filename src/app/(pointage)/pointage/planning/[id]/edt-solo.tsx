"use client";

import * as React from "react";

import { PlanningEdt, type EdtProps, type GroupeEdt, type BlocEdt } from "./edt";
import { ListePersonnel, type PersonneListe } from "./liste-personnel";

/* ============================================================
   PLANNING INDIVIDUEL — liste à gauche, une grille à droite
   ============================================================
   Demande du responsable : n'afficher QU'UN planning hebdomadaire à la
   fois, la personne se choisissant à gauche du tableau.

   Toutes les données de la fenêtre sont déjà chargées : changer de personne
   ne recharge rien, la grille bascule instantanément. L'URL est tenue à
   jour en silence (history.replaceState) pour qu'une vue reste partageable
   par lien, sans déclencher de navigation serveur à chaque changement.
   ============================================================ */

/** Durée d'un bloc en minutes, minuit franchi compris. */
function minutesBloc(b: BlocEdt): number {
  const m = (h: string) => {
    const [a, b2] = h.split(":").map(Number);
    return Number.isFinite(a) && Number.isFinite(b2) ? a * 60 + b2 : null;
  };
  const d = m(b.surchargeDebut || b.debut);
  const f = m(b.surchargeFin || b.fin);
  if (d === null || f === null) return 0;
  return f > d ? f - d : 1440 - d + f;
}

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

  /* La charge de chacun se lit dans les blocs DÉJÀ chargés pour la fenêtre :
     aucune requête de plus pour l'afficher, et le chiffre suit exactement ce
     que montre la grille. */
  const personnes: PersonneListe[] = React.useMemo(
    () =>
      groupes
        .filter((g) => g.agents[0])
        .map((g) => {
          const blocs = edt.blocs[g.cle] ?? [];
          const siens = blocs.filter((b) => b.agentId === g.agents[0].id);
          return {
            id: g.agents[0].id,
            nom: g.agents[0].nom,
            statut: g.agents[0].statut || "Personnel",
            libelle: g.libelle,
            minutes: siens.reduce((s, b) => s + minutesBloc(b), 0),
            creneaux: siens.length,
          };
        }),
    [groupes, edt.blocs],
  );

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
      <ListePersonnel personnes={personnes} selection={agentId} onChoisir={choisir} />
      <div className="min-w-0 flex-1">
        <PlanningEdt {...edt} groupes={[groupeChoisi]} />
      </div>
    </div>
  );
}
