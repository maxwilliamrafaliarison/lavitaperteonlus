import { describe, it, expect } from "vitest";
import {
  joursDePeriode,
  chevauche,
  compterJours,
  moisDeService,
  debutExercice,
  moisComplets,
  calculerSolde,
  libelleNature,
  estNature,
  estActive,
  REGLES,
  NATURES,
} from "./absences";

/* Septembre 2026 : le 1er tombe un mardi, le 6 un dimanche.
   Repère utilisé par plusieurs cas ci-dessous. */

describe("période en jours", () => {
  it("rend les bornes incluses", () => {
    expect(joursDePeriode("2026-09-14", "2026-09-18")).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]);
  });
  it("rend un seul jour quand les bornes se confondent", () => {
    expect(joursDePeriode("2026-09-14", "2026-09-14")).toEqual(["2026-09-14"]);
  });
  it("rend une liste vide si la fin précède le début", () => {
    expect(joursDePeriode("2026-09-18", "2026-09-14")).toEqual([]);
    expect(joursDePeriode("", "2026-09-14")).toEqual([]);
  });
  it("franchit un changement de mois et une année bissextile", () => {
    expect(joursDePeriode("2026-08-30", "2026-09-02")).toHaveLength(4);
    expect(joursDePeriode("2028-02-27", "2028-03-01")).toEqual([
      "2028-02-27",
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });
});

describe("chevauchement de deux périodes", () => {
  const a = { du: "2026-09-14", au: "2026-09-18" };
  it("détecte un recouvrement partiel des deux côtés", () => {
    expect(chevauche(a, { du: "2026-09-17", au: "2026-09-22" })).toBe(true);
    expect(chevauche(a, { du: "2026-09-10", au: "2026-09-15" })).toBe(true);
  });
  it("détecte l'inclusion et l'égalité", () => {
    expect(chevauche(a, { du: "2026-09-15", au: "2026-09-16" })).toBe(true);
    expect(chevauche(a, a)).toBe(true);
  });
  it("accepte deux périodes qui se touchent sans se recouvrir", () => {
    expect(chevauche(a, { du: "2026-09-19", au: "2026-09-25" })).toBe(false);
    expect(chevauche(a, { du: "2026-09-08", au: "2026-09-13" })).toBe(false);
  });
  it("compte un jour commun comme un chevauchement", () => {
    // Reprendre le jour même de la fin serait un double emploi.
    expect(chevauche(a, { du: "2026-09-18", au: "2026-09-25" })).toBe(true);
  });
});

describe("décompte des jours", () => {
  it("compte tous les jours en mode calendaire, dimanche compris", () => {
    // Lundi 14 au dimanche 20 : sept jours calendaires.
    expect(compterJours("2026-09-14", "2026-09-20")).toBe(7);
  });
  it("ne compte que les jours travaillés en mode ouvré", () => {
    expect(
      compterJours("2026-09-14", "2026-09-20", {
        mode: "ouvre",
        joursTravailles: [1, 2, 3, 4, 5, 6],
      }),
    ).toBe(6); // le dimanche 20 tombe
    expect(
      compterJours("2026-09-14", "2026-09-20", { mode: "ouvre", joursTravailles: [1, 2, 3, 4, 5] }),
    ).toBe(5); // samedi et dimanche tombent
  });
  it("ne décompte jamais un férié, quel que soit le mode", () => {
    const feries = ["2026-09-16"];
    expect(compterJours("2026-09-14", "2026-09-18", { feries })).toBe(4);
    expect(
      compterJours("2026-09-14", "2026-09-18", {
        mode: "ouvre",
        joursTravailles: [1, 2, 3, 4, 5],
        feries,
      }),
    ).toBe(4);
  });
  it("rend zéro sur une période vide", () => {
    expect(compterJours("2026-09-18", "2026-09-14")).toBe(0);
  });
  it("compte le cas courant : congé du lundi au vendredi", () => {
    // Cinq jours en calendaire comme en ouvré : aucun week-end traversé.
    expect(compterJours("2026-09-14", "2026-09-18")).toBe(5);
    expect(
      compterJours("2026-09-14", "2026-09-18", { mode: "ouvre", joursTravailles: [1, 2, 3, 4, 5] }),
    ).toBe(5);
  });
});

describe("mois de service", () => {
  it("ne compte que les mois révolus", () => {
    expect(moisDeService("2026-03-15", "2026-04-14")).toBe(0);
    expect(moisDeService("2026-03-15", "2026-04-15")).toBe(1);
    expect(moisDeService("2026-03-15", "2026-09-15")).toBe(6);
  });
  it("franchit l'année", () => {
    expect(moisDeService("2025-09-01", "2026-09-01")).toBe(12);
  });
  it("rend zéro avant l'entrée ou sur une saisie vide", () => {
    expect(moisDeService("2026-09-01", "2026-08-01")).toBe(0);
    expect(moisDeService("", "2026-08-01")).toBe(0);
    expect(moisDeService("pas une date", "2026-08-01")).toBe(0);
  });
});

describe("mois de service, cas du 31", () => {
  it("reconnaît le mois révolu quand le mois d'arrivée est plus court", () => {
    // Entré un 31 janvier : février n'a pas de 31, le mois est révolu
    // le 28. Comparer les quantièmes bruts lui refusait ce mois, puis
    // tous les suivants tombant sur un mois court.
    expect(moisDeService("2026-01-31", "2026-02-28")).toBe(1);
    expect(moisDeService("2026-01-31", "2026-02-27")).toBe(0);
    expect(moisDeService("2026-01-31", "2026-03-31")).toBe(2);
  });
});

describe("début d'exercice", () => {
  it("rend le 1er janvier par défaut", () => {
    expect(debutExercice("2026-09-14")).toBe("2026-01-01");
    expect(debutExercice("2026-01-01")).toBe("2026-01-01");
  });
  it("recule d'un an quand la date d'anniversaire n'est pas encore passée", () => {
    expect(debutExercice("2026-05-14", "07-01")).toBe("2025-07-01");
    expect(debutExercice("2026-08-14", "07-01")).toBe("2026-07-01");
  });
  it("se rabat sur le 1er janvier devant un paramètre invalide", () => {
    expect(debutExercice("2026-09-14", "n'importe quoi")).toBe("2026-01-01");
  });
});

describe("solde de congés", () => {
  it("n'acquiert QUE sur l'exercice en cours, jamais sur toute l'ancienneté", () => {
    /* LE DÉFAUT LE PLUS GRAVE QUE CE MODULE AIT PORTÉ. Sans borne
       d'exercice, une personne entrée en 2019 se voyait créditer
       quatre-vingt-onze mois de service, soit 227,5 jours de congé. Une
       direction qui accorde en regardant ce chiffre n'a plus de garde-fou. */
    const s = calculerSolde({ dateEntree: "2019-01-01", jusquA: "2026-08-31", joursPris: 0, reporte: 6 });
    // Huit mois civils complets depuis le 1er janvier, janvier à août.
    expect(s.acquis).toBe(20);
    expect(s.restant).toBe(26); // plus le report de l'exercice clos
    expect(s.acquis).toBeLessThan(31);
  });

  it("crédite l'exercice entier au 31 décembre, et repart à zéro le 1er janvier", () => {
    // Douze mois civils complets, donc le droit plein. Le 1er janvier
    // ouvre un exercice neuf : le reliquat de l'année close passe alors
    // dans `reporte`, il ne se cumule pas avec la nouvelle acquisition.
    expect(calculerSolde({ dateEntree: "2010-01-01", jusquA: "2026-12-31", joursPris: 0 }).acquis).toBe(30);
    expect(calculerSolde({ dateEntree: "2010-01-01", jusquA: "2027-01-01", joursPris: 0 }).acquis).toBe(0);
  });

  it("compte les mois civils complets, pas les anniversaires", () => {
    expect(moisComplets("2026-01-01", "2026-12-31")).toBe(12);
    expect(moisComplets("2026-01-01", "2026-08-31")).toBe(8);
    expect(moisComplets("2026-01-01", "2026-08-30")).toBe(7); // août incomplet
    expect(moisComplets("2026-03-15", "2026-09-01")).toBe(5); // mars entamé
    expect(moisComplets("2026-09-01", "2026-08-01")).toBe(0);
  });

  it("garde le plafond de douze mois même sur un exercice mal paramétré", () => {
    // Filet de sécurité : si un début d'exercice aberrant remontait à
    // plusieurs années, l'acquisition ne doit pas exploser pour autant.
    const s = calculerSolde({
      dateEntree: "2010-01-01",
      jusquA: "2026-12-31",
      joursPris: 0,
      debutExercice: "2020-01-01",
    });
    expect(s.acquis).toBe(30);
  });

  it("part de la date d'entrée quand elle tombe dans l'exercice", () => {
    // Entrée le 1er mars 2026 : au 1er septembre, six mois, pas huit.
    const s = calculerSolde({ dateEntree: "2026-03-01", jusquA: "2026-09-01", joursPris: 0 });
    expect(s.acquis).toBe(15);
  });

  it("suit un exercice qui ne commence pas le 1er janvier", () => {
    const s = calculerSolde({
      dateEntree: "2020-01-01",
      jusquA: "2026-09-01",
      joursPris: 0,
      debutExercice: "2026-07-01",
    });
    expect(s.acquis).toBe(5); // deux mois révolus depuis le 1er juillet
  });

  it("rend un solde nul sans date d'entrée : aucun droit ne s'invente", () => {
    const s = calculerSolde({ dateEntree: "", jusquA: "2026-09-01", joursPris: 0 });
    expect(s.acquis).toBe(0);
    expect(s.restant).toBe(0);
  });

  it("retranche les jours pris", () => {
    const s = calculerSolde({ dateEntree: "2026-01-01", jusquA: "2026-09-01", joursPris: 12 });
    expect(s.acquis).toBe(20);
    expect(s.restant).toBe(8);
  });

  it("retranche aussi les jours en attente, sans les compter comme pris", () => {
    // Sinon la même personne poserait trois fois le solde qu'il lui reste
    // avant que quiconque ait validé.
    const s = calculerSolde({
      dateEntree: "2026-01-01",
      jusquA: "2026-09-01",
      joursPris: 10,
      joursEnAttente: 5,
    });
    expect(s.pris).toBe(10);
    expect(s.enAttente).toBe(5);
    expect(s.restant).toBe(5);
  });

  it("ajoute le report de l'exercice précédent", () => {
    const s = calculerSolde({
      dateEntree: "2026-01-01",
      jusquA: "2026-09-01",
      joursPris: 0,
      reporte: 4,
    });
    expect(s.acquis).toBe(20);
    expect(s.restant).toBe(24);
  });

  it("arrondit au demi-jour", () => {
    const s = calculerSolde({ dateEntree: "2026-06-01", jusquA: "2026-09-01", joursPris: 0 });
    expect(s.acquis).toBe(7.5);
  });

  it("laisse le solde devenir négatif plutôt que de le masquer", () => {
    // Un dépassement doit se voir : le corriger en silence ferait
    // disparaître une dette réelle de l'employeur ou du salarié.
    const s = calculerSolde({ dateEntree: "2026-06-01", jusquA: "2026-09-01", joursPris: 10 });
    expect(s.restant).toBe(-2.5);
  });

  it("accepte un taux d'acquisition différent du taux légal", () => {
    const s = calculerSolde({
      dateEntree: "2025-01-01",
      jusquA: "2026-12-31",
      joursPris: 0,
      acquisitionParMois: 2,
    });
    expect(s.acquis).toBe(24); // 12 mois civils × 2
  });
});

describe("natures d'absence", () => {
  it("reconnaît les natures connues et rejette les autres", () => {
    expect(estNature("conge")).toBe(true);
    expect(estNature("vacances")).toBe(false);
  });
  it("rend un libellé lisible, y compris pour une valeur inconnue", () => {
    expect(libelleNature("conge")).toBe("Congé payé");
    expect(libelleNature("")).toBe("Absence");
    expect(libelleNature("truc")).toBe("truc");
  });
  it("ne décompte du solde que le congé payé", () => {
    const decomptees = NATURES.filter((n) => REGLES[n].decompteSolde);
    expect(decomptees).toEqual(["conge"]);
  });
  it("neutralise les écarts partout sauf sur l'absence injustifiée", () => {
    // C'est précisément l'anomalie qu'on veut continuer de voir.
    const visibles = NATURES.filter((n) => !REGLES[n].neutraliseEcarts);
    expect(visibles).toEqual(["injustifiee"]);
  });
  it("traite la mission comme du travail", () => {
    expect(REGLES.mission.compteCommeTravail).toBe(true);
    expect(REGLES.conge.compteCommeTravail).toBe(false);
  });
  it("n'active que les absences acceptées", () => {
    expect(estActive("acceptee")).toBe(true);
    for (const e of ["demande", "refusee", "annulee", ""]) {
      expect(estActive(e)).toBe(false);
    }
  });
});
