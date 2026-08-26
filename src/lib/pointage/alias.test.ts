import { describe, expect, it } from "vitest";

import { HORS_REFERENTIEL, normaliserUsuel, resoudreAgent, type AgentIdentifiable } from "./alias";

/* ============================================================
   RÉSOLUTION DES NOMS USUELS
   ============================================================

   Ce module porte les arbitrages tranchés sur les données, pas des
   conventions de nommage. Chaque cas ci-dessous vient d'un fichier réel et
   d'une preuve : un poste, un badge, deux lignes du même jour. Les figer en
   test évite qu'une correction ultérieure du référentiel les défasse sans
   que personne ne le voie.
   ============================================================ */

/** Extrait du référentiel, réduit aux fiches que ces cas mettent en jeu. */
const REFERENTIEL: AgentIdentifiable[] = [
  { id: "AG-REX-14", prenom: "Emma", nom: "RASOLOMAMPIONONA", actif: true },
  { id: "AG-REX-46", prenom: "Emma", nom: "RAFENOSOA", actif: true },
  { id: "AG-REX-EMMASIEGE", prenom: "Emma (siège)", nom: "", actif: true },
  { id: "AG-MIARAKA-13", prenom: "EMMA", nom: "RASOLOMAMPIONONA", actif: false },
  { id: "AG-REX-20", prenom: "Vololomboahangy Nivontsoa Tiana", nom: "RAZAFIMALALA", actif: true },
  { id: "AG-MIARAKA-24", prenom: "Jean Chrysostme", nom: "RAKOTONDRAZAFY", actif: true },
  { id: "AG-REX-18", prenom: "Naina", nom: "RANDRIANARISOA", actif: true },
];

describe("« Emma » au planning de REX", () => {
  it("désigne Emma RASOLOMAMPIONONA, la femme de ménage qui badge l'après-midi", () => {
    const r = resoudreAgent("Emma", REFERENTIEL, "REX");
    expect(r.agentId).toBe("AG-REX-14");
    expect(r.voie).toBe("alias");
  });

  it("distingue « Emma (siege) », toujours qualifiée quand c'est elle", () => {
    for (const ecriture of ["Emma (siege)", "Emma (siège)", "Emma(Siège)", "Emma (SIEGE)"]) {
      expect(resoudreAgent(ecriture, REFERENTIEL, "REX").agentId).toBe("AG-REX-EMMASIEGE");
    }
  });

  it("reconnaît « Emma REX », l'autre écriture du classeur pour la même personne", () => {
    expect(resoudreAgent("Emma REX", REFERENTIEL, "REX").agentId).toBe("AG-REX-14");
  });

  it("laisse « EMMA » à MIARAKA sans réponse, faute de preuve", () => {
    /* Le classeur de MIARAKA a lui aussi une colonne EMMA. Rien n'établit
       qu'elle désigne la même personne, et l'alias de REX ne doit pas
       trancher par ricochet : le cas remonte à la RH. */
    const r = resoudreAgent("EMMA", REFERENTIEL, "MIARAKA");
    expect(r.agentId).toBeNull();
    expect(r.voie).toBe("ambigu");
  });
});

describe("garde-fous généraux", () => {
  it("suit une fiche archivée jusqu'à celle qui l'a absorbée", () => {
    // AG-MIARAKA-13 est la fiche fusionnée d'Emma RASOLOMAMPIONONA.
    expect(resoudreAgent("Emma", REFERENTIEL, "REX").agentId).toBe("AG-REX-14");
  });

  it("écarte les noms tenus hors référentiel par décision", () => {
    expect(HORS_REFERENTIEL.has(normaliserUsuel("Diricks"))).toBe(true);
  });

  it("rattache un nom usuel qui n'a qu'un seul porteur", () => {
    expect(resoudreAgent("Voahangy", REFERENTIEL, "REX").agentId).toBe("AG-REX-20");
  });

  it("ne rattache rien sur un nom vide", () => {
    expect(resoudreAgent("", REFERENTIEL, "REX").agentId).toBeNull();
  });
});
