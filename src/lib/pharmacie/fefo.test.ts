import { describe, it, expect } from "vitest";

import { cmpFEFO, allouer } from "./fefo";
import type { StockLot } from "./types";

/* Ce module décide QUELS lots servent une vente. Une erreur ici vend le
   mauvais lot (péremption), ou fait disparaître du stock. Chaque cas est figé. */

const lot = (o: Partial<StockLot> & { lotId: string }): StockLot => ({
  numeroLot: o.lotId,
  dateExpiration: "",
  gros: 0,
  detail: 0,
  ...o,
});

describe("cmpFEFO — ordre de péremption", () => {
  it("le lot qui périme le plus tôt passe en premier", () => {
    const lots = [
      lot({ lotId: "B", dateExpiration: "2027-06-30" }),
      lot({ lotId: "A", dateExpiration: "2026-12-31" }),
    ];
    expect(lots.sort(cmpFEFO).map((l) => l.lotId)).toEqual(["A", "B"]);
  });

  it("les lots sans date passent en dernier", () => {
    const lots = [
      lot({ lotId: "X", dateExpiration: "" }),
      lot({ lotId: "Y", dateExpiration: "2027-01-01" }),
    ];
    expect(lots.sort(cmpFEFO).map((l) => l.lotId)).toEqual(["Y", "X"]);
  });

  it("départage déterministe par identifiant à date égale", () => {
    const lots = [
      lot({ lotId: "L2", dateExpiration: "2027-01-01" }),
      lot({ lotId: "L1", dateExpiration: "2027-01-01" }),
    ];
    expect(lots.sort(cmpFEFO).map((l) => l.lotId)).toEqual(["L1", "L2"]);
  });
});

describe("allouer — vente à la boîte / produit non fractionnable", () => {
  it("sort du GROS, lot le plus proche de la péremption d'abord", () => {
    const buckets = [
      lot({ lotId: "L1", dateExpiration: "2027-06-30", gros: 5 }),
      lot({ lotId: "L2", dateExpiration: "2026-12-31", gros: 3 }),
    ];
    // Besoin 4 : d'abord L2 (périme plus tôt) = 3, puis L1 = 1.
    const r = allouer(1, 4, "boite", buckets);
    expect(r.ok).toBe(true);
    expect(r.ouvertures).toEqual([]);
    expect(r.allocations).toEqual([
      { lotId: "L2", compartiment: "gros", quantite: 3 },
      { lotId: "L1", compartiment: "gros", quantite: 1 },
    ]);
    // Buckets mutés : L2 vidé, L1 à 4.
    expect(buckets.find((b) => b.lotId === "L2")!.gros).toBe(0);
    expect(buckets.find((b) => b.lotId === "L1")!.gros).toBe(4);
  });

  it("refuse et ne mute rien si le stock total ne couvre pas", () => {
    const buckets = [lot({ lotId: "L1", gros: 2 })];
    const r = allouer(1, 5, "boite", buckets);
    expect(r.ok).toBe(false);
    expect(r.allocations).toEqual([]);
    expect(buckets[0].gros).toBe(2); // intact
  });
});

describe("allouer — vente à l'unité (fractionnable, facteur 30)", () => {
  it("épuise le DÉTAIL ouvert avant d'ouvrir une boîte", () => {
    const buckets = [lot({ lotId: "L1", dateExpiration: "2027-01-01", gros: 60, detail: 8 })];
    // Besoin 5 comprimés : tout depuis le DÉTAIL, aucune boîte ouverte.
    const r = allouer(30, 5, "detail", buckets);
    expect(r.ok).toBe(true);
    expect(r.ouvertures).toEqual([]);
    expect(r.allocations).toEqual([{ lotId: "L1", compartiment: "detail", quantite: 5 }]);
    expect(buckets[0].detail).toBe(3);
    expect(buckets[0].gros).toBe(60);
  });

  it("ouvre une boîte quand le DÉTAIL est insuffisant, et laisse le reliquat en rayon", () => {
    const buckets = [lot({ lotId: "L1", dateExpiration: "2027-01-01", gros: 60, detail: 2 })];
    // Besoin 5 : 2 depuis le DÉTAIL, puis ouvrir 1 boîte (30) pour les 3 restants.
    const r = allouer(30, 5, "detail", buckets);
    expect(r.ok).toBe(true);
    expect(r.ouvertures).toEqual([{ lotId: "L1", quantite: 30 }]);
    expect(r.allocations).toEqual([
      { lotId: "L1", compartiment: "detail", quantite: 2 },
      { lotId: "L1", compartiment: "detail", quantite: 3 },
    ]);
    // Après : GROS 60-30=30 ; DÉTAIL 2-2 +30 -3 = 27 sur l'étagère.
    expect(buckets[0].gros).toBe(30);
    expect(buckets[0].detail).toBe(27);
  });

  it("ouvre des boîtes sur plusieurs lots FEFO si besoin", () => {
    const buckets = [
      lot({ lotId: "L1", dateExpiration: "2026-12-31", gros: 30, detail: 0 }),
      lot({ lotId: "L2", dateExpiration: "2027-06-30", gros: 60, detail: 0 }),
    ];
    // Besoin 40 : ouvrir la boîte de L1 (30), il reste 10 → ouvrir 1 boîte de L2.
    const r = allouer(30, 40, "detail", buckets);
    expect(r.ok).toBe(true);
    expect(r.ouvertures).toEqual([
      { lotId: "L1", quantite: 30 },
      { lotId: "L2", quantite: 30 },
    ]);
    expect(buckets.find((b) => b.lotId === "L1")!.gros).toBe(0);
    expect(buckets.find((b) => b.lotId === "L2")!.gros).toBe(30);
    expect(buckets.find((b) => b.lotId === "L2")!.detail).toBe(20); // 30 ouverts − 10 vendus
  });

  it("refuse si même en ouvrant tout le GROS le compte n'y est pas", () => {
    const buckets = [lot({ lotId: "L1", gros: 30, detail: 5 })]; // 35 max
    const r = allouer(30, 40, "detail", buckets);
    expect(r.ok).toBe(false);
    expect(buckets[0].gros).toBe(30);
    expect(buckets[0].detail).toBe(5);
  });
});
