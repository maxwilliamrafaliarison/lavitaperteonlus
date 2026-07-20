import { describe, it, expect } from "vitest";

import { renderVentePdf, orgInfoFromParams, fiscalFromParams } from "./documents";
import type { VenteComplete } from "../sheets";

function venteBase(over: Partial<VenteComplete> = {}): VenteComplete {
  return {
    id: "VTE-TEST-000001",
    timestamp: "2026-07-20T10:30:00.000Z",
    clientNom: "",
    typeVente: "cash",
    total: 12500,
    pecPayeur: "",
    valeurPec: 0,
    operateurEmail: "eugenio@example.com",
    statut: "active",
    lignes: [
      { produitId: "P1", lotId: "L1", designation: "Paracétamol", dosage: "500mg", quantite: 2, prixUnitaire: 5000, sousTotal: 10000 },
      { produitId: "P2", lotId: "L2", designation: "Amoxicilline", dosage: "250mg", quantite: 1, prixUnitaire: 2500, sousTotal: 2500 },
    ],
    ...over,
  };
}

async function toBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

const org = orgInfoFromParams(new Map());
const sansTva = fiscalFromParams(new Map());
const avecTva = fiscalFromParams(new Map([["tva_active", "1"], ["tva_taux", "20"]]));

describe("rendu PDF ticket/facture", () => {
  it("ticket cash avec espèces reçues → PDF valide", async () => {
    const buf = await toBuffer(await renderVentePdf("ticket", venteBase(), org, sansTva, "fr", 20000));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(3000); // logo embarqué → taille conséquente
  });

  it("facture cash avec TVA 20% → PDF valide", async () => {
    const buf = await toBuffer(await renderVentePdf("facture", venteBase(), org, avecTva, "fr"));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(3000);
  });

  it("ticket prise en charge (total 0, valeur portée) → PDF valide", async () => {
    const vente = venteBase({ typeVente: "pec", total: 0, valeurPec: 12500, pecPayeur: "Miaraka", clientNom: "Miaraka" });
    const buf = await toBuffer(await renderVentePdf("ticket", vente, org, sansTva, "fr"));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("facture PEC en italien → PDF valide", async () => {
    const vente = venteBase({ typeVente: "pec", total: 0, valeurPec: 12500, pecPayeur: "Ilena" });
    const buf = await toBuffer(await renderVentePdf("facture", vente, org, sansTva, "it"));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("en-tête légal : défauts réels présents dans l'org", () => {
    expect(org.nif).toBe("5001978624");
    expect(org.stat).toBe("94111212015000569");
    expect(org.tel).toBe("032 11 515 04");
    expect(org.adresse).toContain("Ambatolahikisoa");
  });
});
