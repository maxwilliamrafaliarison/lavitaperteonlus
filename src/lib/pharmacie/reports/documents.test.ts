import { describe, it, expect } from "vitest";

import { renderPharmacieRapport } from "./documents";
import type { RapportData } from "./data";
import type { ReportContext } from "@/lib/reports/types";

const ctx: ReportContext = {
  lang: "fr",
  generatedBy: "Eugenio",
  generatedAt: "2026-07-20T09:00:00.000Z",
};

async function pdf(data: RapportData): Promise<Buffer> {
  const stream = await renderPharmacieRapport(data, ctx);
  const chunks: Buffer[] = [];
  for await (const c of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

const cas: RapportData[] = [
  {
    type: "ventes",
    from: "2026-07-01",
    to: "2026-07-20",
    cash: [{ id: "VTE-1", date: "2026-07-10T10:00:00Z", tiers: "Comptoir", articles: 2, montant: 12000 }],
    pec: [{ id: "VTE-2", date: "2026-07-11T11:00:00Z", tiers: "Miaraka", articles: 1, montant: 5000 }],
    totalCash: 12000,
    valeurPec: 5000,
  },
  {
    type: "stock",
    lignes: [
      { designation: "Paracétamol", fournisseur: "Sopharmad", stock: "3 btes", seuil: "1 bte", prixUnite: "300 Ar", valeur: 27000, valeurLabel: "27 000 Ar" },
    ],
    valeurTotale: 27000,
    nbProduits: 1,
  },
  {
    type: "a_commander",
    lignes: [{ designation: "Amoxicilline", fournisseur: "Salama", stock: "0", seuil: "2 btes", aCommander: "2 btes" }],
  },
  {
    type: "expiration",
    perimes: [{ designation: "Vitamine C", peremption: "2026-06-01", jours: -49, stock: "5", perime: true }],
    bientot: [{ designation: "Ibuprofène", peremption: "2026-09-15", jours: 57, stock: "12", perime: false }],
  },
  {
    type: "rupture",
    lignes: [{ designation: "Sérum phy", fournisseur: "Médico", seuil: "3 btes" }],
  },
];

describe("rendu PDF rapports pharmacie", () => {
  for (const data of cas) {
    it(`rapport « ${data.type} » → PDF valide`, async () => {
      const buf = await pdf(data);
      expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(buf.length).toBeGreaterThan(1500);
    });
  }

  it("rapports vides → PDF valide (état vide géré)", async () => {
    const vides: RapportData[] = [
      { type: "a_commander", lignes: [] },
      { type: "rupture", lignes: [] },
      { type: "expiration", perimes: [], bientot: [] },
      { type: "stock", lignes: [], valeurTotale: 0, nbProduits: 0 },
      { type: "ventes", from: "2026-07-01", to: "2026-07-20", cash: [], pec: [], totalCash: 0, valeurPec: 0 },
    ];
    for (const d of vides) {
      const buf = await pdf(d);
      expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    }
  });
});
