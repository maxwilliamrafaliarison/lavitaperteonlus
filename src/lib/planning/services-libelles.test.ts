import { describe, expect, it } from "vitest";

import { serviceDuLibelle } from "./services-libelles";

/* Le catalogue réel de `planning.services`. */
const CONNUS = new Set([
  "securite", "nettoyage", "reception", "caisse", "consult", "echo", "mammo", "gyneco",
  "pediatrie", "nutrition", "cpn", "paptest", "coloration", "cytologie", "vaccins",
  "pharmacie", "labo_gal", "labo_analyse", "chauffeur", "admin", "mission",
]);
const s = (libelle: string) => serviceDuLibelle(libelle, CONNUS);

describe("le premier mot-clé du libellé désigne le service", () => {
  it("distingue l'administration d'une mission, selon lequel est écrit d'abord", () => {
    expect(s("Admin + Logistique + RH + Missions")).toBe("admin");
    expect(s("Mission + Logistique + RH")).toBe("mission");
  });

  it("retient l'activité principale quand un complément suit", () => {
    expect(s("Mammographie + Echo mammaire")).toBe("mammo");
    expect(s("Consultations + Colposcopie")).toBe("consult");
    expect(s("Cytologie + Depistage/sénologie")).toBe("cytologie");
    expect(s("pap-test/senologie/fiche/RR + coloration")).toBe("paptest");
    expect(s("CPN+Pap (suivi CPN)")).toBe("cpn");
    expect(s("Pharmacie + fiches")).toBe("pharmacie");
  });

  it("sépare les deux laboratoires, que l'ordre des mots oppose", () => {
    /* « Labo Galenique » écrit « Labo » avant « Galenique » : la règle du
       premier mot-clé donnerait le laboratoire d'analyses, et se tromperait
       sur 831 lignes. C'est le seul cas où l'ordre ne suffit pas. */
    expect(s("Labo Galenique")).toBe("labo_gal");
    expect(s("VISITE APPA - LABO GALENIQUE")).toBe("labo_gal");
    expect(s("Laboratoire Analyses + Cyto")).toBe("labo_analyse");
    expect(s("Labo anapath")).toBe("labo_analyse");
  });
});

describe("les orthographes du terrain", () => {
  it("reconnaît l'accueil sous ses deux écritures", () => {
    /* Le samedi 29 août, l'accueil est tenu sous le second libellé. Sans
       lui, l'application signalait un trou sur un poste critique alors que
       Sylvie y était planifiée. */
    expect(s("Accueil-Caisse")).toBe("caisse");
    expect(s("Accueil-Caisse-RR-Fiches")).toBe("caisse");
  });

  it("tolère accents, casse et espaces variables", () => {
    for (const libelle of ["Sécurité", "SECURITE", "securite"]) expect(s(libelle)).toBe("securite");
    for (const libelle of ["Chauffeur+Logistique", "Chauffeur + Logistique"]) expect(s(libelle)).toBe("chauffeur");
    expect(s("Nettoyage Generale")).toBe("nettoyage");
  });

  it("range le travail hors les murs en mission, sous tous ses noms", () => {
    for (const libelle of [
      "MISSION NORD DIEGO", "Tsena Talata", "Visite de courtoisie NORD",
      "Remise de Resultat Ikalamavony", "RR CSB2 MITSIMBINA",
    ]) {
      expect(s(libelle)).toBe("mission");
    }
  });
});

describe("ce qui ne doit être rattaché à rien", () => {
  it("laisse vides les formations, événements et disciplines hors catalogue", () => {
    for (const libelle of [
      "FORMATION LABORATOIRE", "formation Laboratoire Analyses",
      "semaine de la FISA", "Canrnaval Présid.",
      "Osthéopathe", "Kinesitherapie", "Detartrage",
    ]) {
      expect(s(libelle)).toBe("");
    }
  });

  it("ne rend jamais un service absent du catalogue", () => {
    expect(serviceDuLibelle("Cytologie", new Set(["securite"]))).toBe("");
  });

  it("rend vide sur un libellé vide", () => {
    expect(s("")).toBe("");
    expect(s("   ")).toBe("");
  });
});
