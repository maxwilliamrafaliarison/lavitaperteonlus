import { describe, it, expect } from "vitest";

import { renderBilanMensuel } from "./bilan-pdf";
import type { BilanData } from "./bilan";
import type { ReportContext } from "@/lib/reports/types";

const ctx: ReportContext = { lang: "fr", generatedBy: "Eugenio", generatedAt: "2026-08-01T06:00:00.000Z" };

const data: BilanData = {
  from: "2026-07-01",
  to: "2026-07-31",
  moisLabel: "juillet 2026",
  nbVentes: 60,
  nbCash: 57,
  nbPec: 3,
  caComptant: 1108550,
  valeurPec: 15000,
  panierMoyen: 19448,
  coutVentes: 812000,
  margeBrute: 296550,
  tauxMarge: 26.7,
  nbReferences: 70,
  valeurStockVente: 4616226,
  valeurStockAchat: 3550000,
  nbRuptures: 4,
  nbACommander: 6,
  couvertureMois: 4.4,
  rotationAnnuelle: 2.7,
  topProduits: [
    { nom: "DUPHASTON", ca: 128600, part: 11.6 },
    { nom: "MAG-2", ca: 122000, part: 11.0 },
  ],
  parClasse: [
    { classe: "ANTIBIOTIQUE", ca: 400000, part: 36 },
    { classe: "CONTRACEPTIF", ca: 200000, part: 18 },
  ],
  entreesMois: 622927,
  entreesParFournisseur: [{ fournisseur: "PHARMATEK", montant: 622927, nb: 1 }],
  ruptures: [{ designation: "BACTOCLAV", detail: "PHARMATEK" }],
  aCommander: [{ designation: "AMOXICILLINE", fournisseur: "SALAMA", stock: "0", seuil: "2 btes", aCommander: "2 btes" }],
  perimes: [{ designation: "VITAMINE C", peremption: "2026-06-01", jours: -60, perime: true }],
  bientot: [{ designation: "IBUPROFENE", peremption: "2026-09-15", jours: 57, perime: false }],
  pecParEntite: [{ entite: "Miaraka", valeur: 15000, nb: 3 }],
  fiche: [
    { designation: "DUPHASTON", classe: "CONTRACEPTIF", caSorties: 128600, stockLabel: "20 btes", valeurStock: 428480 },
    { designation: "ACIDE FUSIDIQUE", classe: "—", caSorties: 0, stockLabel: "1 bte", valeurStock: 11804 },
  ],
};

async function toBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

describe("bilan mensuel PDF", () => {
  it("génère un PDF valide (toutes sections)", async () => {
    const buf = await toBuffer(await renderBilanMensuel(data, ctx));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(3000);
  });

  it("gère un mois vide (aucune vente)", async () => {
    const vide: BilanData = {
      ...data,
      nbVentes: 0, nbCash: 0, nbPec: 0, caComptant: 0, valeurPec: 0, panierMoyen: 0,
      coutVentes: 0, margeBrute: 0, tauxMarge: 0, couvertureMois: null, rotationAnnuelle: null,
      topProduits: [], parClasse: [], entreesMois: 0, entreesParFournisseur: [],
      ruptures: [], aCommander: [], perimes: [], bientot: [], pecParEntite: [],
    };
    const buf = await toBuffer(await renderBilanMensuel(vide, ctx));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
