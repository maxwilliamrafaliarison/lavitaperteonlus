import { describe, it, expect } from "vitest";
import { moisDeLaFeuille, parserFeuilleMiaraka } from "./parseur-miaraka";

describe("mois déduit du nom de feuille", () => {
  it("lit les conventions rencontrées", () => {
    expect(moisDeLaFeuille("janvier 26")).toEqual({ mois: 1, annee: 2026 });
    expect(moisDeLaFeuille("Fev26")).toEqual({ mois: 2, annee: 2026 });
    expect(moisDeLaFeuille("aout 26")).toEqual({ mois: 8, annee: 2026 });
    expect(moisDeLaFeuille("DEC25")).toEqual({ mois: 12, annee: 2025 });
    expect(moisDeLaFeuille("Sec Janv")?.mois).toBe(1);
    expect(moisDeLaFeuille("juillet 26")).toEqual({ mois: 7, annee: 2026 });
  });
  it("rend null sur une feuille sans mois", () => {
    expect(moisDeLaFeuille("Feuil1")).toBeNull();
    expect(moisDeLaFeuille("Foglio2")).toBeNull();
  });
});

describe("analyse d'une feuille mensuelle", () => {
  // Extrait fidèle : bloc d'en-tête, puis des jours à cheval sur deux mois.
  const feuille: unknown[][] = [
    ["PLANNING MIARAKA"],
    ["JUILLET/AOUT", "", "FENO", "ANICO", "GERMAIN"],
    [27, "lun", "11H-8H", "REPOS", "07H-12H\n14H-16H30"],
    [28, "mar", "REPOS", "8H-8H", "07H-12H\n14H-16H30"],
    [29, "mer", "11H-8H\nAnkofafa", "REPOS", "REPOS"],
    [30, "jeu", "REPOS", "11H-8H", "07H-12H\n14H-16H30"],
    [31, "ven", "8h-11h\nTsena", "REPOS", "06H- 18H REX"],
    [1, "sam", "REPOS", "8H-8H", "07H-12H"],
    [2, "dim", "REPOS", "REPOS", "REPOS"],
    ["TOTAL", "", "=24*3", "=3*6", "=7.5*6"],
  ];

  const r = parserFeuilleMiaraka("aout 26", feuille);

  it("identifie les agents en colonnes", () => {
    expect(r.agents).toEqual(["FENO", "ANICO", "GERMAIN"]);
  });

  it("reconstitue les dates et franchit le changement de mois", () => {
    // 27→31 juillet, puis 1er et 2 août.
    expect(r.jours).toEqual([
      "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31",
      "2026-08-01", "2026-08-02",
    ]);
  });

  it("lit une garde de nuit", () => {
    const a = r.affectations.find((x) => x.agent === "FENO" && x.jour === "2026-07-27")!;
    expect(a.plages[0]).toEqual({ debut: "11:00", fin: "08:00" });
    expect(a.repos).toBe(false);
  });

  it("reconnaît les repos", () => {
    const a = r.affectations.find((x) => x.agent === "ANICO" && x.jour === "2026-07-27")!;
    expect(a.repos).toBe(true);
    expect(a.plages).toHaveLength(0);
  });

  it("lit une journée coupée sur deux lignes", () => {
    const a = r.affectations.find((x) => x.agent === "GERMAIN" && x.jour === "2026-07-27")!;
    expect(a.plages).toHaveLength(2);
    expect(a.plages[1]).toEqual({ debut: "14:00", fin: "16:30" });
  });

  it("sépare le lieu du créneau", () => {
    expect(r.affectations.find((x) => x.agent === "FENO" && x.jour === "2026-07-29")!.lieu).toBe("Ankofafa");
    expect(r.affectations.find((x) => x.agent === "FENO" && x.jour === "2026-07-31")!.lieu).toBe("Tsena");
  });

  it("repère un agent MIARAKA posté au REX", () => {
    const a = r.affectations.find((x) => x.agent === "GERMAIN" && x.jour === "2026-07-31")!;
    expect(a.lieu).toBe("REX");
    expect(a.plages[0]).toEqual({ debut: "06:00", fin: "18:00" });
  });

  it("ignore la ligne de totaux, dont les formules sont figées", () => {
    // « =24*3 » ne doit engendrer aucune affectation.
    expect(r.affectations.some((a) => a.ecriture.includes("=24"))).toBe(false);
  });

  it("conserve l'écriture d'origine pour audit", () => {
    const a = r.affectations.find((x) => x.agent === "GERMAIN" && x.jour === "2026-07-27")!;
    expect(a.ecriture).toContain("07H-12H");
  });

  it("signale une feuille dont le mois est indéterminable", () => {
    const v = parserFeuilleMiaraka("Feuil1", [[1, "lun", "REPOS"]]);
    expect(v.anomalies[0]).toMatch(/indéterminable/i);
  });

  it("signale une date incohérente avec son jour de semaine", () => {
    const f = parserFeuilleMiaraka("juin 26", [
      ["JUIN", "", "FENO"],
      [1, "dim", "REPOS"], // le 1er juin 2026 est un lundi
    ]);
    expect(f.anomalies[0]).toMatch(/à vérifier/i);
  });
});
