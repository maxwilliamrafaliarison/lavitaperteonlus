import { describe, it, expect } from "vitest";
import { lireDateJour, dateCoherente, lireAgents, parserFeuilleRex, normaliserNom } from "./parseur-rex";

const EN_TETE: unknown[][] = [
  ["PLANNING DE TRAVAIL du 27 JUILLET AU 02 AOUT 2026"],
  ["Le personnel est obligé à respecter le planning."],
  ["Jour", "Service", "Matin", "Après-midi"],
];

describe("lecture des dates", () => {
  it("lit « Lundi 27/07/2026 »", () => {
    expect(lireDateJour("Lundi 27/07/2026")).toEqual({ jour: "2026-07-27", libelleJour: "lundi" });
  });
  it("tolère les retours ligne et espaces parasites", () => {
    expect(lireDateJour("Mardi 28/07/2026\r\n")?.jour).toBe("2026-07-28");
    expect(lireDateJour("Jeudi  07/06/2026")?.jour).toBe("2026-06-07");
  });
  it("lit une date suffixée d'un férié", () => {
    expect(lireDateJour("Lundi 25/05/2026 - LUNDI DE PENTECOTE")?.jour).toBe("2026-05-25");
  });
  it("rejette une note de bas de feuille", () => {
    expect(lireDateJour("NB: Le Centre Rex ouvre à 8h et ferme à 17heures.")).toBeNull();
  });

  it("détecte une date non corrigée après duplication (cas réel)", () => {
    // La feuille « 0308-0908 » portait encore « Jeudi 2/07/2026 » : or le
    // 02/07/2026 est un jeudi… mais « Samedi 25/07/2026 » est un samedi ?
    expect(dateCoherente("2026-07-27", "lundi")).toBe(true); // vrai lundi
    expect(dateCoherente("2026-07-24", "samedi")).toBe(false); // c'est un vendredi
  });
});

describe("découpage des agents", () => {
  it("sépare sur « + »", () => {
    expect(lireAgents("Voahangy + Emma")).toEqual(["Voahangy", "Emma"]);
  });
  it("sépare sur « / » (renfort sécurité)", () => {
    expect(lireAgents("Naina/Diricks")).toEqual(["Naina", "Diricks"]);
  });
  it("gère une liste longue", () => {
    expect(lireAgents("Aina+ Lauria + Anitha + Franco")).toHaveLength(4);
  });
  it("rend un tableau vide sur cellule vide", () => {
    expect(lireAgents("")).toEqual([]);
    expect(lireAgents("   ")).toEqual([]);
  });
});

describe("analyse d'une feuille-semaine", () => {
  const feuille: unknown[][] = [
    ...EN_TETE,
    ["Lundi 27/07/2026", "Sécurité", "Naina", "Naina/Diricks", "Ouverture 7h - Perline"],
    [null, "Nettoyage", "Voahangy + Emma", "Voahangy + Emma", "Cloture - Perline"],
    [null, "Reception", "Sylvie", "Sylvie", "Absente - Lauria+Dr Niry"],
    [null, "Accueil-Caisse", "Perline", "Perline", "Congé - Marcellia+Perline"],
    [null, "Consultations", "Dr Dalianne", "Dr Dalianne", "Salle 6"],
    [null, "Pediatrie", "", "Dc Prudence/dc Jolson", "Salle 8"],
    ["Mardi 28/07/2026", "Sécurité", "Toma", "Toma/Diricks", "Ouverture 7h30 - Aina"],
    ["NB: Le Centre Rex ouvre à 8h et ferme chaque jour à 17heures pour le publique."],
  ];

  const r = parserFeuilleRex("2707-0208", feuille);

  it("lit les deux journées, sans compter la note de bas de feuille", () => {
    expect(r.jours).toEqual(["2026-07-27", "2026-07-28"]);
  });

  it("lit les affectations par service", () => {
    const consult = r.affectations.find((a) => a.service === "Consultations");
    expect(consult?.matin).toEqual(["Dr Dalianne"]);
    expect(consult?.salle).toBe("Salle 6");
  });

  it("gère un service assuré seulement l'après-midi", () => {
    const p = r.affectations.find((a) => a.service === "Pediatrie");
    expect(p?.matin).toEqual([]);
    expect(p?.apresMidi).toEqual(["Dc Prudence", "dc Jolson"]);
  });

  it("extrait les métadonnées du jour depuis la colonne polysémique", () => {
    const m = r.meta.find((x) => x.jour === "2026-07-27")!;
    expect(m.ouverture).toBe("Perline");
    expect(m.cloture).toBe("Perline");
    expect(m.absents).toEqual(["Lauria", "Dr Niry"]);
    expect(m.conges).toEqual(["Marcellia", "Perline"]);
  });

  it("ne confond pas une salle avec une métadonnée", () => {
    // « Salle 6 » est en 5e position du bloc : c'est une salle, pas un congé.
    expect(r.meta.find((x) => x.jour === "2026-07-27")!.conges).not.toContain("Salle 6");
  });

  it("signale une feuille sans date", () => {
    const vide = parserFeuilleRex("Feuil2", [["Jour", "Service"]]);
    expect(vide.anomalies[0]).toMatch(/aucune date/i);
  });

  it("signale une date incohérente avec son jour de semaine", () => {
    const f = parserFeuilleRex("0308-0908", [...EN_TETE, ["Samedi 24/07/2026", "Sécurité", "Naina", "Naina", ""]]);
    expect(f.anomalies[0]).toMatch(/duplication/i);
  });
});

describe("normalisation des noms", () => {
  it("retire les titres médicaux", () => {
    expect(normaliserNom("Dr Dalianne")).toBe("dalianne");
    expect(normaliserNom("Dc Prudence")).toBe("prudence");
    expect(normaliserNom("Pr RAKOTOMAHENINA")).toBe("rakotomahenina");
  });
  it("retire les qualificatifs et parenthèses", () => {
    expect(normaliserNom("Elisa Stagiaire")).toBe("elisa");
    expect(normaliserNom("Emma (siege)")).toBe("emma");
  });
  it("ignore les accents et la casse", () => {
    expect(normaliserNom("Hervé")).toBe(normaliserNom("HERVE"));
    expect(normaliserNom("Stéphanie")).toBe("stephanie");
  });
});
