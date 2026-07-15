import { describe, it, expect } from "vitest";

import {
  estFractionnable,
  facteur,
  versUnitesBase,
  prixPour,
  ventiler,
  enBoites,
  prixParUniteBase,
  prixDetailSuggere,
  formaterQuantite,
} from "./fractionnement";

/* Ces tests figent les règles qui décident du stock sorti et du montant
   facturé. Une régression ici ne se voit pas à l'écran : elle se voit à
   l'inventaire, des semaines plus tard. */

/** Un produit non fractionnable — le cas des 65 produits existants. */
const plat = {
  facteur_conversion: 1,
  unite_detail: "",
  prix_vente: 8126,
  prix_vente_detail: 0,
};

/** Une boîte de 30 comprimés, vendus 300 Ar l'unité. */
const frac = {
  facteur_conversion: 30,
  unite_detail: "comprimé",
  prix_vente: 8126,
  prix_vente_detail: 300,
};

describe("estFractionnable", () => {
  it("dépend du seul facteur de conversion", () => {
    expect(estFractionnable(plat)).toBe(false);
    expect(estFractionnable(frac)).toBe(true);
  });

  it("ne dépend NI du prix de détail NI du libellé d'unité", () => {
    // Le point critique : si l'unité du stock dépendait d'un champ
    // commercial, vider le prix de détail réinterpréterait 600 comprimés
    // en 600 boîtes. Le stock ne suit QUE le facteur.
    const sansPrixDetail = { ...frac, prix_vente_detail: 0 };
    const sansUnite = { ...frac, unite_detail: "" };
    expect(estFractionnable(sansPrixDetail)).toBe(true);
    expect(estFractionnable(sansUnite)).toBe(true);
  });
});

describe("facteur", () => {
  it("ne renvoie jamais une valeur qui casserait une division", () => {
    expect(facteur({ facteur_conversion: 0 })).toBe(1);
    expect(facteur({ facteur_conversion: -5 })).toBe(1);
    expect(facteur({ facteur_conversion: 30 })).toBe(30);
  });
});

describe("versUnitesBase", () => {
  it("est l'identité quand le facteur vaut 1 (aucune régression possible)", () => {
    expect(versUnitesBase(plat, 3, "boite")).toBe(3);
    expect(versUnitesBase(plat, 3, "detail")).toBe(3);
  });

  it("convertit les boîtes en unités de base", () => {
    expect(versUnitesBase(frac, 2, "boite")).toBe(60);
  });

  it("laisse une quantité de détail telle quelle (déjà en unités de base)", () => {
    expect(versUnitesBase(frac, 5, "detail")).toBe(5);
  });
});

describe("prixPour", () => {
  it("prend le prix de comptoir du mode choisi, jamais un prorata", () => {
    expect(prixPour(frac, "boite")).toBe(8126);
    expect(prixPour(frac, "detail")).toBe(300);
    // 300 ≠ 8126/30 ≈ 271 : vendre à l'unité se paie plus cher, c'est voulu.
    expect(prixPour(frac, "detail")).not.toBe(prixParUniteBase(frac));
  });
});

describe("ventiler", () => {
  it("sépare boîtes pleines et appoint", () => {
    expect(ventiler(frac, 68)).toEqual({ boites: 2, appoint: 8 });
    expect(ventiler(frac, 60)).toEqual({ boites: 2, appoint: 0 });
    expect(ventiler(frac, 8)).toEqual({ boites: 0, appoint: 8 });
  });

  it("tronque vers zéro sur un stock négatif, au lieu d'arrondir vers le bas", () => {
    // floor(-68/30) donnerait -3 boîtes + 22 unités : une anomalie déguisée
    // en stock plausible. trunc dit la vérité : -2 boîtes et -8 unités.
    expect(ventiler(frac, -68)).toEqual({ boites: -2, appoint: -8 });
  });
});

describe("enBoites", () => {
  it("garde les décimales (affichage seulement)", () => {
    expect(enBoites(frac, 45)).toBe(1.5);
    expect(enBoites(plat, 12)).toBe(12);
  });
});

describe("prixDetailSuggere", () => {
  it("arrondit à l'Ariary, qui n'a pas de décimales", () => {
    expect(prixDetailSuggere(8126, 30)).toBe(271);
  });

  it("ne suggère rien sans facteur ni prix exploitables", () => {
    expect(prixDetailSuggere(8126, 1)).toBe(0);
    expect(prixDetailSuggere(0, 30)).toBe(0);
  });
});

describe("formaterQuantite", () => {
  it("laisse un produit non fractionnable strictement inchangé", () => {
    expect(formaterQuantite(plat, 12)).toBe("12");
    expect(formaterQuantite(plat, 0)).toBe("0");
  });

  it("compose boîtes et appoint, avec les pluriels", () => {
    expect(formaterQuantite(frac, 68)).toBe("2 btes + 8 comprimés");
    expect(formaterQuantite(frac, 31)).toBe("1 bte + 1 comprimé");
    expect(formaterQuantite(frac, 60)).toBe("2 btes");
    expect(formaterQuantite(frac, 30)).toBe("1 bte");
    expect(formaterQuantite(frac, 8)).toBe("8 comprimés");
  });

  it("affiche un stock négatif en brut, sans le ranger en boîtes", () => {
    expect(formaterQuantite(frac, -68)).toBe("-68 comprimés");
  });

  it("se rabat sur « unité » quand le libellé manque", () => {
    expect(formaterQuantite({ facteur_conversion: 10, unite_detail: "" }, 3)).toBe("3 unités");
  });
});
