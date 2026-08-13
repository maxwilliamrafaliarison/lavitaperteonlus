import { describe, it, expect } from "vitest";

import {
  lireExigences,
  trousCritiques,
  resumerTrous,
  EXIGENCES_DEFAUT,
  type AffectationMinimale,
} from "./postes-critiques";

const libelles = new Map([
  ["securite", "Sécurité"],
  ["caisse", "Accueil-Caisse"],
  ["garde_nuit", "Garde de nuit"],
]);

const aff = (p: Partial<AffectationMinimale>): AffectationMinimale => ({
  jour: "2026-08-17",
  serviceId: "",
  creneauType: "journee",
  repos: false,
  sansTitulaire: false,
  ...p,
});

describe("lecture du réglage", () => {
  it("REX exige la sécurité et l'accueil", () => {
    const e = lireExigences(EXIGENCES_DEFAUT.REX, libelles);
    expect(e).toHaveLength(2);
    expect(e.map((x) => x.valeur)).toEqual(["securite", "caisse"]);
    expect(e[0].libelle).toBe("Sécurité");
  });

  it("MIARAKA exige un créneau de garde, faute de services en base", () => {
    const e = lireExigences(EXIGENCES_DEFAUT.MIARAKA, libelles);
    expect(e).toEqual([{ genre: "type", valeur: "garde_nuit", libelle: "Garde de nuit" }]);
  });

  it("ignore ce qui n'est ni service ni type, sans planter", () => {
    expect(lireExigences("truc:machin,service:,  ,service:securite", libelles)).toHaveLength(1);
  });

  it("un réglage vide n'exige rien — le refus doit être choisi, jamais subi", () => {
    expect(lireExigences("", libelles)).toEqual([]);
    expect(lireExigences(undefined, libelles)).toEqual([]);
  });
});

describe("REX — sécurité et accueil", () => {
  const exigences = lireExigences(EXIGENCES_DEFAUT.REX, libelles);
  const jours = ["2026-08-17", "2026-08-18"];

  it("les deux postes tenus les deux jours : aucun trou", () => {
    const a = jours.flatMap((jour) => [
      aff({ jour, serviceId: "securite" }),
      aff({ jour, serviceId: "caisse" }),
    ]);
    expect(trousCritiques(jours, a, exigences)).toEqual([]);
  });

  it("l'accueil manque le mardi : un seul trou, nommé et daté", () => {
    const a = [
      aff({ jour: "2026-08-17", serviceId: "securite" }),
      aff({ jour: "2026-08-17", serviceId: "caisse" }),
      aff({ jour: "2026-08-18", serviceId: "securite" }),
    ];
    expect(trousCritiques(jours, a, exigences)).toEqual([
      { jour: "2026-08-18", libelle: "Accueil-Caisse" },
    ]);
  });

  it("un agent en congé ne tient pas le poste", () => {
    const a = [
      aff({ jour: "2026-08-17", serviceId: "securite", repos: true }),
      aff({ jour: "2026-08-17", serviceId: "caisse" }),
    ];
    expect(trousCritiques(["2026-08-17"], a, exigences)).toEqual([
      { jour: "2026-08-17", libelle: "Sécurité" },
    ]);
  });

  it("un poste NOTÉ À POURVOIR ne compte pas comme tenu", () => {
    const a = [
      aff({ jour: "2026-08-17", serviceId: "securite", sansTitulaire: true }),
      aff({ jour: "2026-08-17", serviceId: "caisse" }),
    ];
    expect(trousCritiques(["2026-08-17"], a, exigences)).toEqual([
      { jour: "2026-08-17", libelle: "Sécurité" },
    ]);
  });

  it("une personne suffit : la règle ne compte pas les effectifs", () => {
    const a = [aff({ jour: "2026-08-17", serviceId: "securite" }), aff({ jour: "2026-08-17", serviceId: "caisse" })];
    expect(trousCritiques(["2026-08-17"], a, exigences)).toHaveLength(0);
  });
});

describe("MIARAKA — la garde de nuit", () => {
  const exigences = lireExigences(EXIGENCES_DEFAUT.MIARAKA, libelles);

  it("une garde posée, quel qu'en soit le créneau, suffit", () => {
    const a = [aff({ jour: "2026-08-17", creneauType: "garde_nuit" })];
    expect(trousCritiques(["2026-08-17"], a, exigences)).toEqual([]);
  });

  it("une journée continue ne remplace pas une garde", () => {
    const a = [aff({ jour: "2026-08-17", creneauType: "journee" })];
    expect(trousCritiques(["2026-08-17"], a, exigences)).toEqual([
      { jour: "2026-08-17", libelle: "Garde de nuit" },
    ]);
  });

  it("un jour sans la moindre affectation est un trou", () => {
    expect(trousCritiques(["2026-08-17"], [], exigences)).toHaveLength(1);
  });
});

describe("résumé", () => {
  it("groupe par poste et date en clair, pour qui n'a pas la grille sous les yeux", () => {
    const r = resumerTrous([
      { jour: "2026-08-18", libelle: "Sécurité" },
      { jour: "2026-08-17", libelle: "Sécurité" },
      { jour: "2026-08-19", libelle: "Accueil-Caisse" },
    ]);
    expect(r).toContain("Sécurité : lun. 17 août, mar. 18 août");
    expect(r).toContain("Accueil-Caisse : mer. 19 août");
  });
});
