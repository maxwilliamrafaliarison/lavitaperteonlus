#!/usr/bin/env node
/**
 * IMPORT DES FACTURES FOURNISSEURS — cahier papier, 31/07 et 03/08/2026.
 *
 * Saisi depuis trois pages photographiées du registre manuscrit, relues et
 * arbitrées avec le responsable.
 *
 * ── LA RÈGLE DES DEUX MONTANTS ───────────────────────────────────────────
 * Chaque ligne du cahier porte sa VALEUR DE VENTE ; le pied de page porte
 * le MONTANT FACTURÉ, c'est-à-dire le coût d'achat. Le rapport est de
 * 13/10 — trente pour cent de marge — vérifié sur trois des quatre
 * factures et confirmé par le responsable.
 *
 * On enregistre donc :
 *   • le prix de VENTE au catalogue      = montant de ligne ÷ quantité ;
 *   • le montant d'ACHAT du registre     = montant de ligne × 10/13.
 *
 * ── CE QUI N'EST PAS TOUCHÉ ──────────────────────────────────────────────
 * Le prix de vente d'un produit DÉJÀ au catalogue reste inchangé : une
 * facture constate une entrée de stock, elle ne retarife pas le rayon.
 * Modifier un prix est une décision commerciale, prise sciemment.
 *
 * Usage :
 *   npx tsx scripts/import-factures-aout.mts            (lecture seule)
 *   npx tsx scripts/import-factures-aout.mts --apply
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const APPLY = process.argv.includes("--apply");

const { listProduitsAvecStock, enregistrerAchat, appendRows, PHARMA_SHEETS } = await import(
  "../src/lib/pharmacie/sheets.ts"
);

/** Rapport valeur de vente / montant facturé, confirmé par le responsable. */
const MARGE = 13 / 10;

interface LigneCahier {
  /** Libellé du cahier ; sert à retrouver ou créer le produit. */
  nom: string;
  /** Vrai si marqué ★ : produit à créer au catalogue. */
  nouveau?: boolean;
  dci: string;
  dosage: string;
  /** Conditionnement tel qu'écrit (B/30, fl, B/3×10…). */
  contenance: string;
  quantite: number;
  /** Valeur de VENTE de la ligne, telle que portée au cahier. */
  montant: number;
  lot: string;
  /** Péremption normalisée AAAA-MM-JJ. */
  expiration: string;
}

interface Facture {
  fournisseur: string;
  dateFacture: string;
  numFacture: string;
  /** Montant facturé (coût d'achat) porté en rouge au cahier. */
  montantFacture: number;
  lignes: LigneCahier[];
}

const FACTURES: Facture[] = [
  {
    fournisseur: "PHARMATEK",
    dateFacture: "2026-07-31",
    numFacture: "26078125",
    montantFacture: 655355,
    lignes: [
      { nom: "MAG-2", dci: "MAGNESIUM", dosage: "122mg", contenance: "B/30", quantite: 5, montant: 220051, lot: "4099", expiration: "2028-09-01" },
      { nom: "GESTARELLE G", nouveau: true, dci: "COMPLEXE VITAMINIQUE GROSSESSE", dosage: "", contenance: "B/30", quantite: 3, montant: 125427, lot: "350545", expiration: "2027-11-01" },
      { nom: "SILYBON", dci: "SILYMARIN", dosage: "140mg", contenance: "B/30", quantite: 3, montant: 90183, lot: "SBM4001", expiration: "2027-12-01" },
      { nom: "CEFTRIAXONE 1G INJ", nouveau: true, dci: "CEFTRIAXONE", dosage: "1g", contenance: "B/1", quantite: 20, montant: 64896, lot: "260171", expiration: "2029-01-01" },
      { nom: "AMNLODIPINE", dci: "AMNLODIPINE", dosage: "10mg", contenance: "B/3x10", quantite: 10, montant: 38532, lot: "260131", expiration: "2029-01-01" },
      { nom: "D-LOR", dci: "DESLORATADINE", dosage: "2,5mg/5ml", contenance: "flacon", quantite: 10, montant: 79638, lot: "LN001", expiration: "2027-12-01" },
      { nom: "DOXYCYCLINE 100 MG", nouveau: true, dci: "DOXYCYCLINE", dosage: "100mg", contenance: "B/10x10", quantite: 1, montant: 16237, lot: "251033", expiration: "2028-09-01" },
      { nom: "POLYGYNAX", dci: "SUFLATE DE NEOMYCINE/ SULFATE DE POLYMYXINE/ NYSTATINE", dosage: "", contenance: "B/12", quantite: 5, montant: 216996, lot: "GA054", expiration: "2026-10-03" },
    ],
  },
  {
    fournisseur: "PHARMATEK",
    dateFacture: "2026-07-31",
    numFacture: "26078136",
    montantFacture: 45470,
    lignes: [
      { nom: "ALBENDAZOLE SHIFA 400 MG", nouveau: true, dci: "ALBENDAZOLE", dosage: "400mg", contenance: "B/1", quantite: 50, montant: 32825, lot: "ALG2", expiration: "2029-02-01" },
      { nom: "ALBENDAZOLE SHIFA SUSPENSION", nouveau: true, dci: "ALBENDAZOLE", dosage: "200mg", contenance: "flacon", quantite: 10, montant: 26286, lot: "GC26014", expiration: "2029-02-01" },
    ],
  },
  {
    fournisseur: "LABOREX",
    dateFacture: "2026-08-03",
    numFacture: "00-665093.00",
    // Corrigé par le responsable : 459 395 et non 405 300 (lecture du cahier).
    montantFacture: 459395,
    lignes: [
      { nom: "ANGIZAAR 100 MG", nouveau: true, dci: "LOSARTAN", dosage: "100mg", contenance: "B/30", quantite: 5, montant: 192465, lot: "ANHH0058", expiration: "2028-11-01" },
      { nom: "EROFAG 20 MG", nouveau: true, dci: "ESOMEPRAZOLE", dosage: "20mg", contenance: "B/30", quantite: 5, montant: 162273, lot: "EOTP0147", expiration: "2028-12-01" },
      { nom: "ITACARE", dci: "ITRACONAZOLE", dosage: "100mg", contenance: "B/10", quantite: 3, montant: 72969, lot: "ITCH0105", expiration: "2027-07-01" },
      { nom: "LORINOL 10 MG", nouveau: true, dci: "ATORVASTATINE", dosage: "10mg", contenance: "B/30", quantite: 5, montant: 55705, lot: "LRTH0175", expiration: "2028-01-01" },
      { nom: "TURBOVAS 10 MG", nouveau: true, dci: "ROSUVASTATINE", dosage: "10mg", contenance: "B/30", quantite: 3, montant: 113802, lot: "THTP0022", expiration: "2028-10-01" },
    ],
  },
  {
    fournisseur: "LABOREX",
    dateFacture: "2026-08-03",
    numFacture: "00-665093.00-B",
    montantFacture: 81000,
    lignes: [
      { nom: "PAPAZYME", dci: "PAPAIN+SIMETHICONE", dosage: "60mg/25mg", contenance: "B/8", quantite: 10, montant: 105300, lot: "PL025042", expiration: "2028-04-01" },
    ],
  },
];

// ── Rapprochement au catalogue ────────────────────────────────────────────
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const produits = await listProduitsAvecStock();
const parNom = new Map(produits.map((p) => [norm(p.designation), p]));

console.log(`Catalogue : ${produits.length} produits\n`);

let aCreer = 0;
let totalVente = 0;
let totalAchat = 0;

for (const f of FACTURES) {
  const somme = f.lignes.reduce((s, l) => s + l.montant, 0);
  const attendu = Math.round(somme / MARGE);
  const ecart = attendu - f.montantFacture;
  console.log(`${f.fournisseur} · ${f.numFacture} · ${f.dateFacture}`);
  console.log(`  arrêté (vente) ${somme.toLocaleString("fr-FR")} Ar · facturé ${f.montantFacture.toLocaleString("fr-FR")} Ar` +
    `  → attendu ${attendu.toLocaleString("fr-FR")} Ar${Math.abs(ecart) > 50 ? `  ⚠ écart ${ecart}` : "  ✓"}`);
  for (const l of f.lignes) {
    const existant = parNom.get(norm(l.nom));
    const etat = existant ? `existe (${existant.id})` : l.nouveau ? "À CRÉER" : "⚠ ABSENT sans marque ★";
    if (!existant) aCreer += 1;
    console.log(`    ${l.nom.padEnd(30)} ${String(l.quantite).padStart(3)} × ${l.contenance.padEnd(8)} lot ${l.lot.padEnd(11)} ${l.expiration}  ${etat}`);
  }
  totalVente += somme;
  totalAchat += f.montantFacture;
  console.log();
}

console.log(`TOTAL : ${totalVente.toLocaleString("fr-FR")} Ar en valeur de vente · ${totalAchat.toLocaleString("fr-FR")} Ar facturés`);
console.log(`${aCreer} produit(s) à créer au catalogue.`);

if (!APPLY) {
  console.log("\n(lecture seule — relancez avec --apply pour enregistrer)");
  process.exit(0);
}

// ── Création des produits neufs ───────────────────────────────────────────
const now = new Date().toISOString();
const aujourdhui = now.slice(0, 10);
let prochainId = 1 + produits
  .map((p) => Number(/^PHA-(\d+)$/.exec(p.id)?.[1] ?? 0))
  .reduce((a, b) => Math.max(a, b), 0);

const nouvellesLignes: unknown[][] = [];
for (const f of FACTURES) {
  for (const l of f.lignes) {
    if (parNom.has(norm(l.nom))) continue;
    const id = `PHA-${String(prochainId++).padStart(3, "0")}`;
    /* Prix de vente = valeur portée au cahier ÷ quantité, le coût d'achat
       s'en déduisant par la marge. Ordre des colonnes : voir
       PHARMA_SHEETS.produits dans sheets.ts. */
    const prixVente = Math.round(l.montant / l.quantite);
    nouvellesLignes.push([
      id, "", l.nom, l.dci, "", "", l.dosage, l.contenance,
      Math.round(prixVente / MARGE), prixVente, 0, 1,
      f.fournisseur, "", "actif", now, 1, "", 0, "",
    ]);
    parNom.set(norm(l.nom), { id, designation: l.nom, facteur_conversion: 1 } as never);
    console.log(`  + ${id}  ${l.nom.padEnd(30)} ${prixVente.toLocaleString("fr-FR")} Ar`);
  }
}
if (nouvellesLignes.length) await appendRows(PHARMA_SHEETS.produits, nouvellesLignes);

// ── Enregistrement des entrées ────────────────────────────────────────────
for (const f of FACTURES) {
  const achatId = `ACH-CAHIER-${f.numFacture.replace(/[^A-Z0-9]/gi, "")}`;
  const lignesRows: unknown[][] = [];
  const lotsRows: unknown[][] = [];
  const mouvementsRows: unknown[][] = [];
  let montantTotal = 0;

  for (const [i, l] of f.lignes.entries()) {
    const p = parNom.get(norm(l.nom))!;
    // Montant d'ACHAT : la valeur de vente ramenée par la marge.
    const montantAchat = Math.round(l.montant / MARGE);
    const lotId = `${achatId}-LOT${i + 1}`;
    lignesRows.push([`${achatId}-L${i + 1}`, achatId, p.id, l.nom, l.contenance, l.quantite, l.expiration, l.lot, montantAchat]);
    lotsRows.push([lotId, p.id, l.lot, l.expiration, aujourdhui, l.contenance]);
    mouvementsRows.push([
      `${achatId}-M${i + 1}`, `${f.dateFacture}T12:00:00.000Z`, p.id, lotId, "entree",
      l.quantite, l.quantite > 0 ? Math.round(montantAchat / l.quantite) : 0,
      achatId, "informatique.lavitaperte@gmail.com", `Achat ${f.numFacture} (cahier)`,
      "boite", 1, "gros",
    ]);
    montantTotal += montantAchat;
  }

  const achatRow = [
    achatId, `${f.dateFacture}T12:00:00.000Z`, f.dateFacture, f.fournisseur,
    f.numFacture, "", montantTotal, "informatique.lavitaperte@gmail.com", "valide",
    `Saisie du cahier papier · arrêté ${f.lignes.reduce((s, l) => s + l.montant, 0).toLocaleString("fr-FR")} Ar en valeur de vente`,
  ];
  await enregistrerAchat({ achatRow, lignesRows, lotsRows, mouvementsRows });
  console.log(`  ✓ ${f.fournisseur} ${f.numFacture} — ${lignesRows.length} ligne(s), ${montantTotal.toLocaleString("fr-FR")} Ar`);
}

console.log("\n✅ Import terminé.");
