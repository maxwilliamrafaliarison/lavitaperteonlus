import { describe, it, expect } from "vitest";
import {
  traverseMinuit,
  dureePlage,
  dureeCreneau,
  plagesDuJour,
  verifierSeuils,
  analyserEcriture,
  SEUILS_DEFAUT,
} from "./creneau";
import { versHeures } from "@/lib/pointage/calcul";

describe("passage de minuit", () => {
  it("reconnaît une garde de nuit", () => {
    expect(traverseMinuit("11:00", "08:00")).toBe(true); // 11H-8H, 537 occurrences
    expect(traverseMinuit("17:00", "06:00")).toBe(true); // 17H-6H, 577 occurrences
    expect(traverseMinuit("08:00", "08:00")).toBe(true); // 8H-8H = 24 h, 576 occ.
  });
  it("ne confond pas avec une journée normale", () => {
    expect(traverseMinuit("08:00", "12:00")).toBe(false);
    expect(traverseMinuit("06:00", "18:00")).toBe(false); // 06H-18H REX
  });
});

describe("durées réelles des plannings MIARAKA", () => {
  it("garde 11h-8h = 21 h, et non une durée négative", () => {
    expect(versHeures(dureePlage("11:00", "08:00"))).toBe("21:00");
  });
  it("garde 8h-8h = 24 h, et non 0", () => {
    expect(versHeures(dureePlage("08:00", "08:00"))).toBe("24:00");
  });
  it("sécurité nuit 17h-6h = 13 h", () => {
    expect(versHeures(dureePlage("17:00", "06:00"))).toBe("13:00");
  });
  it("sécurité jour 6h-18h = 12 h", () => {
    expect(versHeures(dureePlage("06:00", "18:00"))).toBe("12:00");
  });
  it("journée coupée 7h-12h / 14h-16h30 = 7 h 30", () => {
    const c = { type: "fractionnee", debut: "07:00", fin: "12:00", debut2: "14:00", fin2: "16:30", minutes: 0 };
    expect(versHeures(dureeCreneau(c))).toBe("7:30");
  });
  it("le barème du centre prime sur l'amplitude quand il est renseigné", () => {
    // Une garde peut inclure des heures de repos non décomptées.
    const c = { type: "garde_nuit", debut: "11:00", fin: "08:00", debut2: "", fin2: "", minutes: 720 };
    expect(dureeCreneau(c)).toBe(720);
  });
  it("un repos vaut zéro", () => {
    expect(dureeCreneau({ type: "repos", debut: "", fin: "", debut2: "", fin2: "", minutes: 0 })).toBe(0);
  });
});

describe("plages absolues (rattachement des pointages)", () => {
  it("une garde de nuit finit le LENDEMAIN", () => {
    const p = plagesDuJour("2026-07-27", { type: "garde_nuit", debut: "17:00", fin: "06:00", debut2: "", fin2: "" });
    expect(p[0]).toEqual({ debut: "2026-07-27 17:00", fin: "2026-07-28 06:00" });
  });
  it("une journée coupée donne deux plages le même jour", () => {
    const p = plagesDuJour("2026-07-27", { type: "fractionnee", debut: "08:00", fin: "12:00", debut2: "14:00", fin2: "17:00" });
    expect(p).toHaveLength(2);
    expect(p[1].fin).toBe("2026-07-27 17:00");
  });
  it("un repos ne produit aucune plage", () => {
    expect(plagesDuJour("2026-07-27", { type: "repos", debut: "", fin: "", debut2: "", fin2: "" })).toHaveLength(0);
  });
});

describe("conformité — directive 2003/88/CE", () => {
  const j = (jour: string, debut: string, fin: string, minutes: number) => ({
    jour,
    plages: plagesDuJour(jour, { type: "journee", debut, fin, debut2: "", fin2: "" }),
    minutes,
  });

  it("alerte quand le repos de 11 h n'est pas respecté après une garde", () => {
    // Garde 17h→6h puis reprise à 8h le lendemain : 2 h de repos seulement.
    const a = verifierSeuils([
      { jour: "2026-07-27", plages: plagesDuJour("2026-07-27", { type: "garde_nuit", debut: "17:00", fin: "06:00", debut2: "", fin2: "" }), minutes: 780 },
      j("2026-07-28", "08:00", "17:00", 480),
    ]);
    const repos = a.find((x) => x.regle === "repos_journalier");
    expect(repos?.bloquant).toBe(true);
    expect(repos?.message).toMatch(/2:00/);
  });

  it("ne se déclenche pas sur un enchaînement normal", () => {
    const a = verifierSeuils([j("2026-07-27", "08:00", "17:00", 480), j("2026-07-28", "08:00", "17:00", 480)]);
    expect(a.filter((x) => x.regle === "repos_journalier")).toHaveLength(0);
  });

  it("alerte au-delà de 48 h sur 7 jours consécutifs", () => {
    const jours = Array.from({ length: 7 }, (_, i) => j(`2026-07-${String(20 + i).padStart(2, "0")}`, "08:00", "18:00", 600));
    const a = verifierSeuils(jours);
    expect(a.some((x) => x.regle === "max_hebdomadaire")).toBe(true); // 70 h
  });

  it("ne déclenche pas le plafond sur une semaine de 40 h", () => {
    const jours = Array.from({ length: 7 }, (_, i) => j(`2026-07-${String(20 + i).padStart(2, "0")}`, "08:00", "16:00", 343));
    expect(verifierSeuils(jours).some((x) => x.regle === "max_hebdomadaire")).toBe(false);
  });

  it("les seuils sont paramétrables", () => {
    expect(SEUILS_DEFAUT.reposJournalierMinMinutes).toBe(660);
  });
});

describe("lecture des écritures réelles des fichiers Excel", () => {
  it("lit une garde « 11H-8H »", () => {
    const r = analyserEcriture("11H-8H");
    expect(r.reconnu).toBe(true);
    expect(r.plages[0]).toEqual({ debut: "11:00", fin: "08:00" });
  });

  it("lit les quatre écritures d'heure du corpus", () => {
    for (const [txt, debut] of [
      ["7H-12H", "07:00"],
      ["07H-12H", "07:00"],
      ["07:00H-12H", "07:00"],
      ["8h - 12h", "08:00"],
    ] as const) {
      expect(analyserEcriture(txt).plages[0].debut).toBe(debut);
    }
  });

  it("lit une journée coupée sur deux lignes", () => {
    const r = analyserEcriture("07H-12H\n14H-16H30");
    expect(r.plages).toHaveLength(2);
    expect(r.plages[1]).toEqual({ debut: "14:00", fin: "16:30" });
  });

  it("lit une journée coupée sur UNE SEULE ligne", () => {
    /* Feuille « Fev26 », 30 cellules. Les minutes doivent être collées à
       leur « H » : en tolérant une espace, le « 14 » de l'après-midi était
       lu comme les minutes du matin, et la journée se terminait à 12h14. */
    const r = analyserEcriture("8H30 - 12H 14H30 - 17H");
    expect(r.plages).toEqual([
      { debut: "08:30", fin: "12:00" },
      { debut: "14:30", fin: "17:00" },
    ]);
    expect(r.lieu).toBe("");
  });

  it("lit une journée coupée par une barre oblique, lieu compris", () => {
    // 26 cellules : l'après-midi partait en guise de lieu, et le vrai lieu
    // était perdu puisque la place était déjà prise.
    const r = analyserEcriture("8H-12H / 14H-17H\nankofafa");
    expect(r.plages).toEqual([
      { debut: "08:00", fin: "12:00" },
      { debut: "14:00", fin: "17:00" },
    ]);
    expect(r.lieu).toBe("ankofafa");
  });

  it("sépare le lieu du créneau", () => {
    expect(analyserEcriture("8h-11h\nAnkofafa").lieu).toBe("Ankofafa");
    expect(analyserEcriture("06H- 18H REX").lieu).toBe("REX");
  });

  it("reconnaît les repos et absences dans leurs multiples orthographes", () => {
    for (const t of ["REPOS", "CONGE", "congé", "feriè", "FERIE", "Maternité"]) {
      expect(analyserEcriture(t).repos).toBe(true);
    }
  });

  it("signale une écriture non comprise plutôt que de la compter à zéro", () => {
    const r = analyserEcriture("déjeuner BEPC Off");
    expect(r.reconnu).toBe(false);
    expect(r.brut).toBe("déjeuner BEPC Off");
    expect(r.plages).toHaveLength(0);
  });

  it("tolère la coquille « 11H - 8HH » présente 20 fois", () => {
    const r = analyserEcriture("11H - 8HH");
    expect(r.plages[0]).toEqual({ debut: "11:00", fin: "08:00" });
  });
});
