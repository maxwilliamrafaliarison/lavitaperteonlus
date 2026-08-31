/* ============================================================
   Tests des écarts au planning.

   Chaque cas vient d'une CELLULE RÉELLE des classeurs de la RH — juin et
   juillet 2026 — et non d'un scénario inventé. Le nom du test dit d'où il
   sort : si un jour le moteur diverge, on saura exactement quelle ligne de
   quel onglet il faut aller relire.
   ============================================================ */
import { describe, it, expect } from "vitest";

import {
  ecartsDuJour,
  minutesDeNuit,
  agregerEcarts,
  REGLAGE_DEFAUT,
  type CreneauDuJour,
  type PassageSite,
} from "./ecarts";

/** Fabrique les passages d'un jour à partir d'heures "HH:MM". */
const passages = (jour: string, site: string, ...heures: string[]): PassageSite[] =>
  heures.map((h) => ({ horodatage: `${jour} ${h}:00`, site }));

const CRENEAU_7_12: CreneauDuJour = { debut: "07:00", fin: "12:00", site: "MIARAKA", libelle: "7H-12H" };

describe("retard — Cynthia, MIARAKA, juin 2026, créneau 7H-12H", () => {
  it("02/06 : arrivée 07:03 → 3 minutes, sans aucune tolérance", () => {
    const e = ecartsDuJour("2026-06-02", passages("2026-06-02", "MIARAKA", "07:03", "12:00"), CRENEAU_7_12);
    expect(e.retardMinutes).toBe(3);
    expect(e.etat).toBe("retard");
  });

  it("03/06 : arrivée 07:25 → 25 minutes", () => {
    const e = ecartsDuJour("2026-06-03", passages("2026-06-03", "MIARAKA", "07:25", "12:00"), CRENEAU_7_12);
    expect(e.retardMinutes).toBe(25);
  });

  it("01/06 : arrivée 06:58 → aucun retard, et les 2 minutes d'avance sont créditées", () => {
    const e = ecartsDuJour("2026-06-01", passages("2026-06-01", "MIARAKA", "06:58", "12:00"), CRENEAU_7_12);
    expect(e.retardMinutes).toBe(0);
    expect(e.avanceIgnoreeMinutes).toBe(0);
    expect(e.debutRetenu).toBe("06:58");
    expect(e.etat).toBe("conforme");
  });
});

describe("avance plafonnée — Maurice, MIARAKA, juin 2026, créneau 17H-6H (plafond 30 min)", () => {
  const reglage = { ...REGLAGE_DEFAUT, avanceMaxMinutes: 30 };
  const soir: CreneauDuJour = { debut: "17:00", fin: "23:59", site: "MIARAKA", libelle: "17H - 6H" };

  it("04/06 : badge à 16:23 → compté à partir de 16:30, 7 minutes ignorées", () => {
    const e = ecartsDuJour("2026-06-04", passages("2026-06-04", "MIARAKA", "16:23", "23:59"), soir, reglage);
    expect(e.debutRetenu).toBe("16:30");
    expect(e.avanceIgnoreeMinutes).toBe(7);
  });

  it("01/06 : badge à 16:32, après le plafond → retenu tel quel", () => {
    const e = ecartsDuJour("2026-06-01", passages("2026-06-01", "MIARAKA", "16:32", "23:59"), soir, reglage);
    expect(e.debutRetenu).toBe("16:32");
    expect(e.avanceIgnoreeMinutes).toBe(0);
  });

  it("le plafond de 15 min des agents de sécurité mord plus tôt", () => {
    const e = ecartsDuJour("2026-06-04", passages("2026-06-04", "MIARAKA", "16:23", "23:59"), soir);
    expect(e.debutRetenu).toBe("16:45");
    expect(e.avanceIgnoreeMinutes).toBe(22);
  });
});

describe("sortie anticipée — Naina, REX, juillet 2026, créneau 06H-18H", () => {
  const c: CreneauDuJour = { debut: "06:00", fin: "18:00", site: "REX", libelle: "06h-18h" };

  it("01/07 : sortie 17:59 → 1 minute, la minute compte", () => {
    const e = ecartsDuJour("2026-07-01", passages("2026-07-01", "REX", "06:00", "17:59"), c);
    expect(e.departAnticipeMinutes).toBe(1);
    expect(e.etat).toBe("sortie_anticipee");
  });

  it("04/07 : sortie 17:54 → 6 minutes", () => {
    const e = ecartsDuJour("2026-07-04", passages("2026-07-04", "REX", "05:59", "17:54"), c);
    expect(e.departAnticipeMinutes).toBe(6);
  });

  it("14/07 : sortie 18:05, après l'heure → aucun écart signalé", () => {
    const e = ecartsDuJour("2026-07-14", passages("2026-07-14", "REX", "05:56", "18:05"), c);
    expect(e.departAnticipeMinutes).toBe(0);
    expect(e.retardMinutes).toBe(0);
    expect(e.etat).toBe("conforme");
  });
});

describe("heures de nuit — plage 22:00 → 05:00", () => {
  it("un poste du soir 16:32→23:59 porte 1 h 59 de nuit (le classeur arrondit à 2 h)", () => {
    expect(minutesDeNuit("16:32", "23:59")).toBe(119);
  });

  it("un poste du matin 00:00→06:00 porte 5 h de nuit", () => {
    expect(minutesDeNuit("00:00", "06:00")).toBe(300);
  });

  it("Feno, 18/06 : la journée entière 00:00→23:59 porte 6 h 59 (7 h au classeur)", () => {
    expect(minutesDeNuit("00:00", "23:59")).toBe(419);
  });

  it("une journée ordinaire 07:00→17:00 ne porte aucune heure de nuit", () => {
    expect(minutesDeNuit("07:00", "17:00")).toBe(0);
  });

  it("Maurice, 01/06 : les deux plages du jour totalisent 6 h 59", () => {
    const e = ecartsDuJour(
      "2026-06-01",
      passages("2026-06-01", "MIARAKA", "00:00", "06:00", "16:32", "23:59"),
      { debut: "00:00", fin: "23:59", site: "MIARAKA" },
    );
    expect(e.minutesNuit).toBe(300 + 119);
  });
});

describe("sans badge — la pointeuse de MIARAKA ne voit pas tout", () => {
  it("un créneau prévu sans le moindre passage n'est PAS un retard", () => {
    const e = ecartsDuJour("2026-07-08", [], CRENEAU_7_12);
    expect(e.etat).toBe("sans_badge");
    expect(e.retardMinutes).toBe(0);
    expect(e.departAnticipeMinutes).toBe(0);
    expect(e.motifs[0]).toContain("Aucun passage");
  });

  it("un seul passage dit une sortie non badgée, jamais une sortie anticipée", () => {
    const e = ecartsDuJour("2026-07-08", passages("2026-07-08", "MIARAKA", "07:00"), CRENEAU_7_12);
    expect(e.departAnticipeMinutes).toBe(0);
    expect(e.etat).toBe("a_verifier");
    expect(e.motifs.some((m) => m.includes("sortie n'a pas été badgée"))).toBe(true);
  });

  it("un jour de repos sans passage ne signale rien", () => {
    const e = ecartsDuJour("2026-06-06", [], { debut: "", fin: "", repos: true, libelle: "REPOS" });
    expect(e.etat).toBe("repos");
    expect(e.motifs).toHaveLength(0);
  });

  it("badger un jour de repos est signalé, sans être un retard", () => {
    const e = ecartsDuJour("2026-06-06", passages("2026-06-06", "MIARAKA", "08:00", "12:00"), {
      debut: "",
      fin: "",
      repos: true,
      libelle: "REPOS",
    });
    expect(e.etat).toBe("hors_planning");
    expect(e.retardMinutes).toBe(0);
  });
});

describe("écart démesuré — un passage manque, ce n'est pas une faute", () => {
  it("28/07, Manitrarivo : premier badge 12:02 pour un service à 8 h → à vérifier, pas 4 h de retard", () => {
    const e = ecartsDuJour(
      "2026-07-28",
      passages("2026-07-28", "REX", "12:02", "17:00"),
      { debut: "08:00", fin: "17:00", site: "REX", libelle: "8H-12H / 14H-17H" },
    );
    expect(e.etat).toBe("a_verifier");
    expect(e.retardMinutes).toBe(242); // la minute est dite…
    expect(e.motifs.some((m) => m.includes("passage manque"))).toBe(true); // …mais pas reprochée
  });

  it("28/07, Lauria : dernier badge 12:11 pour une fin à 17 h → à vérifier", () => {
    const e = ecartsDuJour(
      "2026-07-28",
      passages("2026-07-28", "REX", "08:39", "12:11"),
      { debut: "08:00", fin: "17:00", site: "REX" },
    );
    expect(e.etat).toBe("a_verifier");
  });

  it("les journées à vérifier ne pèsent pas sur les totaux du mois", () => {
    const mois = [
      ecartsDuJour("2026-07-27", passages("2026-07-27", "REX", "08:05", "17:00"), {
        debut: "08:00",
        fin: "17:00",
        site: "REX",
      }),
      ecartsDuJour("2026-07-28", passages("2026-07-28", "REX", "12:02", "17:00"), {
        debut: "08:00",
        fin: "17:00",
        site: "REX",
      }),
    ];
    const a = agregerEcarts(mois);
    expect(a.minutesRetard).toBe(5); // et non 5 + 242
    expect(a.joursEnRetard).toBe(1);
    expect(a.joursAVerifier).toBe(1);
  });
});

describe("multi-site — personne ne peut être à deux endroits à la fois", () => {
  it("badger à REX quand le planning dit MIARAKA est signalé", () => {
    const e = ecartsDuJour("2026-06-15", passages("2026-06-15", "REX", "07:00", "12:00"), CRENEAU_7_12);
    expect(e.siteConforme).toBe(false);
    expect(e.sitesBadges).toEqual(["REX"]);
    expect(e.motifs.some((m) => m.includes("MIARAKA"))).toBe(true);
  });

  it("Cynthia, 15/06 : le matin à MIARAKA puis l'après-midi à REX — les deux sites sont retenus", () => {
    const e = ecartsDuJour(
      "2026-06-15",
      [
        ...passages("2026-06-15", "MIARAKA", "06:58", "11:01"),
        ...passages("2026-06-15", "REX", "13:37", "17:00"),
      ],
      { debut: "07:00", fin: "11:00", site: "MIARAKA", libelle: "7H-11H REX 14" },
    );
    expect(e.sitesBadges).toEqual(["MIARAKA", "REX"]);
    expect(e.motifs.some((m) => m.includes("deux sites"))).toBe(true);
  });

  it("sans site au planning, aucun reproche n'est fait", () => {
    const e = ecartsDuJour("2026-06-15", passages("2026-06-15", "REX", "07:00", "12:00"), {
      debut: "07:00",
      fin: "12:00",
    });
    expect(e.siteConforme).toBeNull();
  });
});

describe("agrégation du mois", () => {
  it("compte les jours et les minutes, et liste les sites fréquentés", () => {
    const mois = [
      ecartsDuJour("2026-06-02", passages("2026-06-02", "MIARAKA", "07:03", "12:00"), CRENEAU_7_12),
      ecartsDuJour("2026-06-03", passages("2026-06-03", "MIARAKA", "07:25", "12:00"), CRENEAU_7_12),
      ecartsDuJour("2026-06-04", passages("2026-06-04", "REX", "07:00", "11:50"), CRENEAU_7_12),
      ecartsDuJour("2026-06-05", [], CRENEAU_7_12),
    ];
    const a = agregerEcarts(mois);
    expect(a.joursEnRetard).toBe(2);
    expect(a.minutesRetard).toBe(28);
    expect(a.joursSortieAnticipee).toBe(1);
    expect(a.minutesDepartAnticipe).toBe(10);
    expect(a.joursSansBadge).toBe(1);
    expect(a.sites).toEqual(["MIARAKA", "REX"]);
    expect(a.joursHorsSite).toBe(1);
  });
});

describe("absence acceptée", () => {
  const conge = { nature: "conge", libelle: "Congé payé", neutraliseEcarts: true };

  it("ne signale plus « sans badge » un jour de congé validé", () => {
    // Le défaut d'origine : Voahangy en congé du 14 au 18 restait affectée
    // au planning et ressortait en anomalie chacun de ces cinq jours.
    const sans = ecartsDuJour("2026-09-14", [], CRENEAU_7_12);
    expect(sans.etat).toBe("sans_badge");

    const avec = ecartsDuJour("2026-09-14", [], CRENEAU_7_12, REGLAGE_DEFAUT, undefined, conge);
    expect(avec.etat).toBe("absent_justifie");
    expect(avec.motifs).toEqual(["Congé payé"]);
    expect(avec.retardMinutes).toBe(0);
  });

  it("ne masque rien si la personne a badgé malgré son congé", () => {
    // Revenue travailler ou saisie erronée : les deux méritent d'être vues.
    const e = ecartsDuJour(
      "2026-09-14",
      passages("2026-09-14", "MIARAKA", "07:25", "12:00"),
      CRENEAU_7_12,
      REGLAGE_DEFAUT,
      undefined,
      conge,
    );
    expect(e.etat).toBe("retard");
    expect(e.retardMinutes).toBe(25);
    expect(e.motifs[0]).toBe("Congé payé : des passages sont pourtant enregistrés");
  });

  it("laisse voir l'anomalie quand l'absence est injustifiée", () => {
    const injustifiee = { nature: "injustifiee", libelle: "Absence injustifiée", neutraliseEcarts: false };
    const e = ecartsDuJour("2026-09-14", [], CRENEAU_7_12, REGLAGE_DEFAUT, undefined, injustifiee);
    expect(e.etat).toBe("sans_badge");
  });

  it("sort les jours d'absence des totaux de retard du mois", () => {
    const agrege = agregerEcarts([
      ecartsDuJour("2026-09-14", [], CRENEAU_7_12, REGLAGE_DEFAUT, undefined, conge),
      ecartsDuJour("2026-09-15", [], CRENEAU_7_12, REGLAGE_DEFAUT, undefined, conge),
      ecartsDuJour("2026-09-16", passages("2026-09-16", "MIARAKA", "07:10", "12:00"), CRENEAU_7_12),
    ]);
    expect(agrege.joursAbsenceJustifiee).toBe(2);
    expect(agrege.joursSansBadge).toBe(0);
    expect(agrege.joursEnRetard).toBe(1);
    expect(agrege.minutesRetard).toBe(10);
  });
});
