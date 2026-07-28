import { describe, it, expect } from "vitest";
import { nomAffiche } from "./data";

describe("nom affiché sans répétition", () => {
  it("supprime le prénom usuel déjà contenu dans le nom complet", () => {
    // Cas réels relevés sur le planning publié.
    expect(nomAffiche({ prenom: "Emma", nom: "RAFENOSOA Emma" })).toBe("RAFENOSOA Emma");
    expect(nomAffiche({ prenom: "Dalianne", nom: "HAJANIRINA Ravakiniaina Dalianne" }))
      .toBe("HAJANIRINA Ravakiniaina Dalianne");
    expect(nomAffiche({ prenom: "William", nom: "RANDRIANASOLO William" })).toBe("RANDRIANASOLO William");
  });

  it("ignore accents et casse", () => {
    expect(nomAffiche({ prenom: "Hervé", nom: "RAKOTOHAJANIRINA Herve" })).toBe("RAKOTOHAJANIRINA Herve");
    expect(nomAffiche({ prenom: "Stéphanie", nom: "SOAMIANDRIRAY Stephanie" })).toBe("SOAMIANDRIRAY Stephanie");
  });

  it("conserve le prénom quand le nom complet ne le contient pas", () => {
    expect(nomAffiche({ prenom: "Manitra", nom: "RAZANAKOTO Manitrarivo" }))
      .toBe("Manitra RAZANAKOTO Manitrarivo");
  });

  it("ne coupe pas sur une correspondance partielle", () => {
    // « Marc » ne doit pas être absorbé par « Marcellia ».
    expect(nomAffiche({ prenom: "Marc", nom: "RAMANANTSOA Marcellia" })).toBe("Marc RAMANANTSOA Marcellia");
  });

  it("gère les fiches incomplètes", () => {
    expect(nomAffiche({ prenom: "Naina", nom: "" })).toBe("Naina");
    expect(nomAffiche({ prenom: "", nom: "RATSIMBAZAFY Haingotiana" })).toBe("RATSIMBAZAFY Haingotiana");
    expect(nomAffiche({ prenom: "", nom: "", id: "AG-REX-99" })).toBe("AG-REX-99");
  });

  it("tolère les espaces parasites", () => {
    expect(nomAffiche({ prenom: "  Emma  ", nom: " RAFENOSOA Emma " })).toBe("RAFENOSOA Emma");
  });
});
