import { describe, it, expect } from "vitest";
import {
  calculerJournee,
  fusionnerPassages,
  versMinutes,
  versHeures,
  jourSemaine,
  agregerMois,
  type HoraireTheorique,
} from "./calcul";

const STD: HoraireTheorique = {
  matinDebut: "08:00",
  matinFin: "12:00",
  apremDebut: "14:00",
  apremFin: "17:00",
  joursTravailles: [1, 2, 3, 4, 5, 6],
  toleranceMinutes: 5,
  minutesJour: 420,
};
const ev = (...h: string[]) => h.map((x) => ({ horodatage: `2026-06-01 ${x}`, jour: "2026-06-01" }));

describe("utilitaires", () => {
  it("convertit heures et minutes", () => {
    expect(versMinutes("08:30")).toBe(510);
    expect(versMinutes("8:05:22")).toBe(485);
    expect(versMinutes("")).toBeNull();
    expect(versHeures(510)).toBe("8:30");
    expect(versHeures(0)).toBe("0:00");
  });
  it("donne le jour de semaine ISO", () => {
    expect(jourSemaine("2026-06-01")).toBe(1); // lundi
    expect(jourSemaine("2026-06-07")).toBe(7); // dimanche
  });
});

describe("fusion des passages rapprochés", () => {
  it("fusionne visage + empreinte du même passage (cas réel ZKTeco)", () => {
    // Un agent badge au visage puis à l'empreinte à 2 s d'intervalle.
    const p = fusionnerPassages(ev("06:44:10", "06:44:12", "12:13:00"));
    expect(p).toEqual(["2026-06-01 06:44:10", "2026-06-01 12:13:00"]);
  });
  it("ne fusionne pas deux vrais passages distincts", () => {
    expect(fusionnerPassages(ev("08:00:00", "12:00:00"))).toHaveLength(2);
  });
  it("trie les événements désordonnés (l'export ZKAccess est antichronologique)", () => {
    const p = fusionnerPassages(ev("17:28:00", "06:44:00"));
    expect(p[0]).toContain("06:44");
  });

  it("tient la règle des deux minutes, et pas au-delà", () => {
    /* Seuil porté de 90 à 120 s le 31 août 2026. Mesuré sur les 16 486
       pointages enregistrés : l'élargissement n'ajoute que huit fusions,
       toutes des paires de 94 à 119 secondes. */
    expect(fusionnerPassages(ev("08:00:00", "08:01:59"))).toHaveLength(1);
    expect(fusionnerPassages(ev("08:00:00", "08:02:01"))).toHaveLength(2);
  });

  it("redresse les deux erreurs constatées le 31 août", () => {
    /* Voahangy : deux badges à DEUX secondes, lus sans fusion comme une
       entrée puis une sortie. Elle était comptée repartie alors qu'elle
       venait d'arriver. Un passage, nombre impair, donc présente. */
    expect(fusionnerPassages(ev("07:09:58", "07:10:00"))).toHaveLength(1);

    /* Volahanitra : sortie badgée deux fois. Sans fusion, trois passages,
       nombre impair, donc « présente » alors qu'elle était partie. Deux
       passages après fusion : entrée puis sortie. */
    expect(fusionnerPassages(ev("08:22:36", "10:57:51", "10:57:53"))).toHaveLength(2);
  });
});

describe("calcul d'une journée", () => {
  it("journée complète 4 pointages (cas nominal du centre)", () => {
    // 6:44 → 12:13, 14:09 → 17:28 = 5h29 + 3h19 = 8h48 (feuille Excel réelle)
    const j = calculerJournee("2026-06-01", ev("06:44:00", "12:13:00", "14:09:00", "17:28:00"), STD);
    expect(versHeures(j.minutesTravaillees)).toBe("8:48");
    expect(j.plages).toHaveLength(2);
    expect(versHeures(j.minutesPause)).toBe("1:56");
    expect(j.anomalies).toHaveLength(0);
    // 8h48 > 7h théoriques → 1h48 d'heures sup PROPOSÉES
    expect(versHeures(j.minutesSupProposees)).toBe("1:48");
  });

  it("ignore le sens annoncé par la pointeuse (souvent faux) et suit l'ordre", () => {
    // Les mêmes passages, quel que soit le Check-In/Check-Out de la machine.
    const j = calculerJournee("2026-06-01", ev("08:00:00", "12:00:00"), STD);
    expect(versHeures(j.minutesTravaillees)).toBe("4:00");
  });

  it("compte le retard au-delà de la tolérance", () => {
    const j = calculerJournee("2026-06-01", ev("08:09:00", "12:00:00"), STD);
    expect(j.minutesRetard).toBe(4); // 9 min de retard − 5 min de tolérance
  });

  it("ne compte pas de retard dans la tolérance", () => {
    expect(calculerJournee("2026-06-01", ev("08:04:00", "12:00:00"), STD).minutesRetard).toBe(0);
  });

  it("compte le départ anticipé", () => {
    const j = calculerJournee("2026-06-01", ev("08:00:00", "12:00:00", "14:00:00", "16:30:00"), STD);
    expect(j.minutesDepartAnticipe).toBe(25); // 30 min avant 17:00 − 5 min
  });

  it("signale un pointage impair SANS inventer d'heure de sortie", () => {
    const j = calculerJournee("2026-06-01", ev("08:00:00"), STD);
    expect(j.minutesTravaillees).toBe(0);
    expect(j.anomalies[0]).toMatch(/sortie non enregistrée/i);
    expect(j.plages[0].fin).toBeNull();
  });

  it("signale 3 pointages (un passage manque)", () => {
    const j = calculerJournee("2026-06-01", ev("08:00:00", "12:00:00", "14:00:00"), STD);
    expect(j.anomalies[0]).toMatch(/impair/i);
    expect(versHeures(j.minutesTravaillees)).toBe("4:00"); // seule la plage complète compte
  });

  it("dimanche : jour non ouvré, présence signalée", () => {
    const dim = [{ horodatage: "2026-06-07 09:00:00", jour: "2026-06-07" }, { horodatage: "2026-06-07 11:00:00", jour: "2026-06-07" }];
    const j = calculerJournee("2026-06-07", dim, STD);
    expect(j.jourOuvre).toBe(false);
    expect(j.anomalies[0]).toMatch(/non ouvré/i);
    expect(versHeures(j.minutesTravaillees)).toBe("2:00"); // le temps est compté quand même
    expect(j.minutesRetard).toBe(0); // mais pas de retard un dimanche
  });

  it("samedi matin travaillé (usage du centre)", () => {
    const sam = [{ horodatage: "2026-06-06 08:00:00", jour: "2026-06-06" }, { horodatage: "2026-06-06 12:00:00", jour: "2026-06-06" }];
    const j = calculerJournee("2026-06-06", sam, STD);
    expect(j.jourOuvre).toBe(true);
    expect(versHeures(j.minutesTravaillees)).toBe("4:00");
  });

  it("journée sans aucun pointage = absence, sans anomalie parasite", () => {
    const j = calculerJournee("2026-06-01", [], STD);
    expect(j.minutesTravaillees).toBe(0);
    expect(j.plages).toHaveLength(0);
    expect(j.anomalies).toHaveLength(0);
  });

  it("un ajustement motivé prime sur la machine et lève l'anomalie", () => {
    const j = calculerJournee("2026-06-01", ev("08:00:00"), STD, {
      matinDebut: "08:00",
      matinFin: "12:00",
      apremDebut: "14:00",
      apremFin: "17:00",
    });
    expect(versHeures(j.minutesTravaillees)).toBe("7:00");
    expect(j.ajuste).toBe(true);
    expect(j.anomalies).toHaveLength(0);
  });

  it("un congé n'est ni un retard ni une anomalie", () => {
    const j = calculerJournee("2026-06-01", [], STD, { typeAbsence: "conge" });
    expect(j.typeAbsence).toBe("conge");
    expect(j.minutesRetard).toBe(0);
    expect(j.anomalies).toHaveLength(0);
  });

  it("horaire gardien en journée continue", () => {
    const gardien: HoraireTheorique = { ...STD, matinDebut: "06:00", matinFin: "18:00", apremDebut: "", apremFin: "", joursTravailles: [1, 2, 3, 4, 5, 6, 7], minutesJour: 720 };
    const j = calculerJournee("2026-06-07", [{ horodatage: "2026-06-07 06:00:00", jour: "2026-06-07" }, { horodatage: "2026-06-07 18:00:00", jour: "2026-06-07" }], gardien);
    expect(versHeures(j.minutesTravaillees)).toBe("12:00");
    expect(j.jourOuvre).toBe(true);
    expect(j.minutesSupProposees).toBe(0);
  });
});

describe("règle LIM (prestataires)", () => {
  it("plafonne une entrée matinale trop tôt (cas réel Franco 7:47 → 7:50)", () => {
    const j = calculerJournee("2026-06-15", ev("07:47:00", "12:00:00"), STD, undefined, true);
    expect(j.plages[0].debut).toBe("07:50");
    expect(versHeures(j.minutesTravaillees)).toBe("4:10");
  });

  it("plafonne l'entrée de l'après-midi (cas réel Lucia 13:46 → 13:50)", () => {
    const j = calculerJournee("2026-06-03", ev("08:00:00", "12:00:00", "13:46:00", "17:00:00"), STD, undefined, true);
    expect(j.plages[1].debut).toBe("13:50");
    expect(versHeures(j.minutesTravaillees)).toBe("7:10"); // 4:00 + 3:10
  });

  it("ne touche pas une entrée déjà après le plafond", () => {
    const j = calculerJournee("2026-06-15", ev("08:05:00", "12:00:00"), STD, undefined, true);
    expect(j.plages[0].debut).toBe("08:05");
  });

  it("ne s'applique PAS aux salariés (comportement inchangé)", () => {
    const j = calculerJournee("2026-06-15", ev("07:47:00", "12:00:00"), STD);
    expect(j.plages[0].debut).toBe("07:47");
    expect(versHeures(j.minutesTravaillees)).toBe("4:13");
  });

  it("ne retouche jamais l'heure de sortie", () => {
    const j = calculerJournee("2026-06-15", ev("07:30:00", "11:45:00"), STD, undefined, true);
    expect(j.plages[0].fin).toBe("11:45");
  });
});

describe("agrégation mensuelle", () => {
  it("totalise le mois d'un agent", () => {
    const jours = [
      calculerJournee("2026-06-01", ev("08:00:00", "12:00:00", "14:00:00", "17:00:00"), STD),
      calculerJournee("2026-06-02", ev("08:10:00", "12:00:00", "14:00:00", "17:00:00"), STD),
      calculerJournee("2026-06-03", [], STD),
    ];
    const m = agregerMois(jours);
    expect(m.joursTravailles).toBe(2);
    expect(versHeures(m.minutesTravaillees)).toBe("13:50");
    expect(m.minutesRetard).toBe(5);
  });
});
