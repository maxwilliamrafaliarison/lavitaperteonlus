import { describe, it, expect } from "vitest";
import { parserFeuille, parserClasseur, normaliserHorodatage, idPointage } from "./parseur";

const EN_TETES = ["Date And Time", "Personnel ID", "First Name", "Last Name", "Card Number", "Device Name", "Event Point", "Verify Type", "In/Out Status", "Event Description", "Remarks"];
const ligne = (dt: unknown, id: string, prenom: string, device = "REX", sens = "Check-In", verif = "Only Fingerprint", desc = "Normal Punch Open") =>
  [dt, id, prenom, null, null, device, "REX1-1", verif, sens, desc, null];

describe("normalisation de l'horodatage", () => {
  it("lit le format ISO de ZKAccess", () => {
    expect(normaliserHorodatage("2026-06-30 20:35:22")).toBe("2026-06-30 20:35:22");
  });
  it("lit un serial Excel numérique (cas réel REX mai 2026)", () => {
    // 46148.50383101852 s'affiche "5/6/26 12:05" dans Excel
    const h = normaliserHorodatage(46148.50383101852);
    expect(h.slice(0, 10)).toBe("2026-05-06");
    expect(h.slice(11, 16)).toBe("12:05");
  });
  it("lit le format affiché m/j/aa", () => {
    expect(normaliserHorodatage("5/6/26 12:05")).toBe("2026-05-06 12:05:00");
  });
  it("rend vide sur une valeur inexploitable plutôt qu'une date inventée", () => {
    expect(normaliserHorodatage("n/a")).toBe("");
    expect(normaliserHorodatage(null)).toBe("");
  });
});

describe("parseur de feuille", () => {
  it("extrait les pointages valides", () => {
    const p = parserFeuille([EN_TETES, ligne("2026-06-01 08:00:00", "15", "Aina")]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ idPointeuse: "15", prenom: "Aina", jour: "2026-06-01", appareil: "REX", sensBrut: "in" });
  });

  it("filtre les lignes parasites « Disconnected »", () => {
    const p = parserFeuille([
      EN_TETES,
      ligne("2026-06-01 10:21:28", "", "", "REX", "None", "Others", "Disconnected"),
      ligne("2026-06-01 08:00:00", "15", "Aina"),
    ]);
    expect(p).toHaveLength(1);
  });

  it("repère les colonnes par libellé, pas par position", () => {
    const entetesInverses = ["Personnel ID", "Date And Time", "First Name"];
    const p = parserFeuille([entetesInverses, ["15", "2026-06-01 08:00:00", "Aina"]]);
    expect(p[0].jour).toBe("2026-06-01");
    expect(p[0].idPointeuse).toBe("15");
  });

  it("ignore une feuille qui n'est pas un export de pointages", () => {
    expect(parserFeuille([["Nom", "Total"], ["Aina", "120:00"]])).toHaveLength(0);
  });

  it("conserve le sens brut même quand il est douteux", () => {
    // Premier passage du jour étiqueté Check-Out (cas réel fréquent).
    const p = parserFeuille([EN_TETES, ligne("2026-06-01 06:44:00", "15", "Aina", "REX", "Check-Out")]);
    expect(p[0].sensBrut).toBe("out");
  });
});

describe("parseur de classeur (multi-feuilles ZKAccess)", () => {
  it("lit toutes les feuilles et dédoublonne les tranches qui se chevauchent", () => {
    const f1: unknown[][] = [EN_TETES, ligne("2026-06-01 08:00:00", "15", "Aina"), ligne("2026-06-07 08:00:00", "15", "Aina")];
    const f2: unknown[][] = [EN_TETES, ligne("2026-06-07 08:00:00", "15", "Aina"), ligne("2026-06-08 08:00:00", "15", "Aina")];
    const r = parserClasseur([["01-07-06", f1], ["08-15-06", f2]]);
    expect(r.lignesLues).toBe(4);
    expect(r.pointages).toHaveLength(3); // le 07/06 n'est compté qu'une fois
    expect(r.ignoreesDoublons).toBe(1);
  });

  it("compte les lignes parasites ignorées", () => {
    const f: unknown[][] = [EN_TETES, ligne("2026-06-01 10:00:00", "", "", "REX", "None", "Others", "Disconnected"), ligne("2026-06-01 08:00:00", "15", "Aina")];
    const r = parserClasseur([["data", f]]);
    expect(r.ignoreesParasites).toBe(1);
    expect(r.pointages).toHaveLength(1);
  });

  it("trie chronologiquement (l'export ZKAccess est antichronologique)", () => {
    const f: unknown[][] = [EN_TETES, ligne("2026-06-10 08:00:00", "15", "A"), ligne("2026-06-01 08:00:00", "15", "A")];
    const r = parserClasseur([["data", f]]);
    expect(r.pointages[0].jour).toBe("2026-06-01");
  });

  it("signale une feuille sans pointage exploitable", () => {
    const r = parserClasseur([["Feuil3", [["Nom"], ["x"]]]]);
    expect(r.anomalies[0]).toMatch(/aucun pointage/i);
  });
});

describe("identifiant déterministe (idempotence)", () => {
  it("produit le même id pour le même pointage", () => {
    const p = { idPointeuse: "15", prenom: "Aina", horodatage: "2026-06-01 08:00:00", jour: "2026-06-01", appareil: "REX", sensBrut: "in", verif: "" };
    expect(idPointage(p, "REX")).toBe("PTG-REX-15-20260601080000");
    expect(idPointage(p, "REX")).toBe(idPointage(p, "REX"));
  });
  it("distingue les installations (même ID, personnes différentes)", () => {
    const p = { idPointeuse: "4", prenom: "Aina", horodatage: "2026-06-01 08:00:00", jour: "2026-06-01", appareil: "MIARAKA", sensBrut: "in", verif: "" };
    expect(idPointage(p, "MIARAKA")).not.toBe(idPointage({ ...p }, "REX"));
  });
});
