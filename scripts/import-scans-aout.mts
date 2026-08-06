#!/usr/bin/env node
/**
 * PRISE EN COMPTE DES 19 PAGES SCANNÉES — factures originales, 06/08/2026.
 *
 * Les scans contiennent les ORIGINAUX des factures de juin et fin juillet
 * (déjà en base — ils ont servi à vérifier, pas à ressaisir) et DEUX
 * factures nouvelles : MEDICO FV+2612649 du 27/07 et MADABEL 2606027 du
 * 08/06. Ils révèlent aussi trois erreurs de la saisie manuscrite d'hier,
 * l'original faisant foi contre le cahier.
 *
 * ── LES CORRECTIONS DE STOCK ─────────────────────────────────────────────
 * Mes ajustements d'unités d'hier ont DOUBLONNÉ deux corrections déjà
 * faites à l'écran (mouvements MVT-FRACT-*) : ESOFAG et LORINOL comptent
 * 145 unités de trop chacun. L'arithmétique des mouvements le prouve :
 * la correction d'écran amenait déjà le stock exactement au physique.
 * L'amlodipine porte en outre l'excès d'une conversion faite au facteur
 * 100 quand la boîte en contient 30 : 70 unités fantômes.
 * On REVERSE par mouvement tracé — jamais en effaçant l'historique.
 *
 * ── ESOFAG, PAS EROFAG ───────────────────────────────────────────────────
 * L'original LABOREX écrit « ESOFAG 20MG B/30 » ; le manuscrit m'avait
 * fait lire « EROFAG ». Or le catalogue possédait déjà ESOFAG-20 (même
 * molécule, même boîte de 30, autre fournisseur). Le produit créé hier
 * est donc renommé à son vrai nom et devient LE produit ESOFAG ; l'ancien
 * PHA-030, à stock nul, est archivé comme doublon.
 *
 * Usage :
 *   npx tsx scripts/import-scans-aout.mts            (lecture seule)
 *   npx tsx scripts/import-scans-aout.mts --apply
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const APPLY = process.argv.includes("--apply");

const { listProduitsAvecStock, enregistrerAchat, appendRows, updateProduitFields, PHARMA_SHEETS } =
  await import("../src/lib/pharmacie/sheets.ts");
const { sbInsert, sbUpdate } = await import("../src/lib/supabase-server.ts");

const EMAIL = "informatique.lavitaperte@gmail.com";
const produits = await listProduitsAvecStock();
const parId = new Map(produits.map((p) => [p.id, p]));

console.log("── État avant ──");
for (const id of ["PHA-077", "PHA-078", "PHA-059", "PHA-030", "PHA-047", "PHA-029", "PHA-045", "PHA-068", "PHA-069", "PHA-070"]) {
  const x = parId.get(id);
  if (x) console.log(`  ${id} ${x.designation.padEnd(30)} stock ${String(x.stockBase).padStart(4)}`);
}

if (!APPLY) {
  console.log("\n(lecture seule — relancez avec --apply)");
  process.exit(0);
}

const ts = new Date().toISOString();

/* ── 1. Reprises des doublons de correction ─────────────────────────── */
await sbInsert("pharmacie", "mouvements", [
  {
    id: "MVT-REPRISE-PHA-077", timestamp: ts, produit_id: "PHA-077", lot_id: "ACH-CAHIER-0066509300-LOT2",
    type: "ajustement", quantite: -145, prix_unitaire: 0, reference: "REPRISE-DOUBLE-CORR",
    user_email: EMAIL,
    note: "Reprise : la correction d'unité doublonnait l'ajustement déjà fait à l'écran (MVT-FRACT-MSHGD1O5). L'arithmétique des mouvements prouve que le stock était déjà juste.",
    unite_saisie: "boite", facteur_applique: 1, compartiment: "gros",
  },
  {
    id: "MVT-REPRISE-PHA-078", timestamp: ts, produit_id: "PHA-078", lot_id: "ACH-CAHIER-0066509300-LOT4",
    type: "ajustement", quantite: -145, prix_unitaire: 0, reference: "REPRISE-DOUBLE-CORR",
    user_email: EMAIL,
    note: "Reprise : doublon avec MVT-FRACT-MSHHKRJY (correction déjà faite à l'écran).",
    unite_saisie: "boite", facteur_applique: 1, compartiment: "gros",
  },
  {
    id: "MVT-REPRISE-PHA-059", timestamp: ts, produit_id: "PHA-059", lot_id: "MVT-059",
    type: "ajustement", quantite: -70, prix_unitaire: 0, reference: "REPRISE-CONV-FACTEUR",
    user_email: EMAIL,
    note: "Reprise : l'ancienne boîte avait été convertie au facteur 100 (+99) alors qu'elle contient 30 comprimés (+29). Excès de 70 unités fantômes.",
    unite_saisie: "boite", facteur_applique: 1, compartiment: "gros",
  },
]);
console.log("1. Reprises écrites : ESOFAG −145 · LORINOL −145 · AMNLODIPINE −70");

/* ── 2. ESOFAG : vrai nom, doublon archivé ──────────────────────────── */
await updateProduitFields("PHA-077", { designation: "ESOFAG 20 MG" });
await updateProduitFields("PHA-030", { statut: "archive" });
console.log("2. PHA-077 renommé « ESOFAG 20 MG » · PHA-030 (doublon, stock nul) archivé");

/* ── 3. Lots LABOREX : l'original fait foi ──────────────────────────── */
await sbUpdate("pharmacie", "lots", { id: "eq.ACH-CAHIER-0066509300-LOT3" },
  { numero_lot: "ITCH0109", date_expiration: "2027-11-01" });
await sbUpdate("pharmacie", "lots", { id: "eq.ACH-CAHIER-0066509300-LOT5" },
  { numero_lot: "THTP0021" });
await sbUpdate("pharmacie", "achats_lignes", { id: "eq.ACH-CAHIER-0066509300-L3" },
  { numero_lot: "ITCH0109", date_expiration: "2027-11-01" });
await sbUpdate("pharmacie", "achats_lignes", { id: "eq.ACH-CAHIER-0066509300-L5" },
  { numero_lot: "THTP0021" });
// Le vrai numéro de la seconde facture LABOREX (PAPAZYME) : 00-665094-00.
await sbUpdate("pharmacie", "achats", { id: "eq.ACH-CAHIER-0066509300B" },
  { num_facture: "00-665094-00" });
console.log("3. Lots corrigés (ITCH0109 · THTP0021) · facture PAPAZYME renumérotée 00-665094-00");

/* ── 4. APDYL-H : le produit cherché hier ───────────────────────────── */
const APDYL_ID = "PHA-080";
if (!parId.has(APDYL_ID)) {
  await appendRows(PHARMA_SHEETS.produits, [[
    APDYL_ID, "", "APDYL-H SIROP 100ML", "DIPHENHYDRAMINE + AMMONIUM", "", "sirop", "", "flacon 100ml",
    7740, 10062, 0, 1, "MEDICO", "", "actif", ts, 1, "", 0, "",
  ]]);
  console.log(`4. + ${APDYL_ID} APDYL-H SIROP 100ML · achat 7 740 · vente 10 062`);
}

/* ── 5. MEDICO FV+2612649 du 27/07 — avec les gratuités ─────────────── */
{
  const achatId = "ACH-MEDICO-FV2612649";
  const lignes = [
    // [produit, désignation, contenance, boîtes payées, gratuites, montant, lot, exp]
    [APDYL_ID, "APDYL-H SIROP 100ML", "flacon 100ml", 10, 0, 77400, "CK04485", "2030-10-31"],
    ["PHA-047", "PANTONEX DR 40MG B/30", "B/30", 10, 1, 72900, "IBS1426004", "2027-12-31"],
    ["PHA-029", "M-OXACILLINE 500MG 24 GELU", "B/24", 10, 2, 283500, "251005", "2028-10-31"],
    ["PHA-045", "ZERODOL-P 100/500MG B/30", "B/30", 20, 2, 225000, "BPW0726012", "2028-02-28"],
  ] as const;
  const lignesRows: unknown[][] = [];
  const lotsRows: unknown[][] = [];
  const mouvementsRows: unknown[][] = [];
  let total = 0;
  lignes.forEach(([pid, nom, cont, payees, gratuites, montant, lot, exp], i) => {
    const f = Number(parId.get(pid)?.facteur_conversion ?? 1);
    /* Les GRATUITÉS entrent en stock comme les payées : le tiroir les
       vendra au même prix. Seul le montant d'achat ne les compte pas —
       c'est toute la valeur du geste commercial. */
    const boites = payees + gratuites;
    const lotId = `${achatId}-LOT${i + 1}`;
    lignesRows.push([`${achatId}-L${i + 1}`, achatId, pid, nom, cont, boites, exp, lot, montant]);
    lotsRows.push([lotId, pid, lot, exp, "2026-07-27", cont]);
    mouvementsRows.push([
      `${achatId}-M${i + 1}`, "2026-07-27T12:00:00.000Z", pid, lotId, "entree",
      boites * f, boites > 0 ? Math.round(montant / (boites * f)) : 0, achatId, EMAIL,
      gratuites ? `Achat FV+2612649 (${gratuites} boîte(s) gratuite(s) incluse(s))` : "Achat FV+2612649",
      "boite", f, "gros",
    ]);
    total += montant;
  });
  await enregistrerAchat({
    achatRow: [achatId, "2026-07-27T12:00:00.000Z", "2026-07-27", "MEDICO", "FV+2612649", "EV+2612653",
      total, EMAIL, "valide", "Saisie de la facture originale scannée · 3 boîtes gratuites incluses au stock"],
    lignesRows, lotsRows, mouvementsRows,
  });
  console.log(`5. ✓ MEDICO FV+2612649 — 4 lignes · ${total.toLocaleString("fr-FR")} Ar · gratuités au stock`);
}

/* ── 6. MADABEL 2606027 du 08/06 — consommables ─────────────────────── */
{
  const achatId = "ACH-MADABEL-2606027";
  const lignes = [
    ["PHA-068", "COMPRESSE NON STERILE 10X10", "Boîte de 100", 1, 19500, "5A255108", "2030-11-01"],
    ["PHA-069", "NYLON 2.0 90CM (fil à peau)", "Boîte de 12", 1, 42000, "251211", "2030-12-01"],
    ["PHA-070", "VYCRYL 2/0 90CM RESORBABLE", "Boîte de 12", 1, 61200, "260319", "2029-03-01"],
  ] as const;
  const lignesRows: unknown[][] = [];
  const lotsRows: unknown[][] = [];
  const mouvementsRows: unknown[][] = [];
  let total = 0;
  lignes.forEach(([pid, nom, cont, boites, montant, lot, exp], i) => {
    const f = Number(parId.get(pid)?.facteur_conversion ?? 1);
    const lotId = `${achatId}-LOT${i + 1}`;
    lignesRows.push([`${achatId}-L${i + 1}`, achatId, pid, nom, cont, boites, exp, lot, montant]);
    lotsRows.push([lotId, pid, lot, exp, "2026-06-08", cont]);
    mouvementsRows.push([
      `${achatId}-M${i + 1}`, "2026-06-08T12:00:00.000Z", pid, lotId, "entree",
      boites * f, Math.round(montant / (boites * f)), achatId, EMAIL,
      "Achat MADABEL 2606027", "boite", f, "gros",
    ]);
    total += montant;
  });
  await enregistrerAchat({
    achatRow: [achatId, "2026-06-08T12:00:00.000Z", "2026-06-08", "MADABEL", "2606027", "",
      total, EMAIL, "valide", "Saisie de la facture originale scannée (consommables)"],
    lignesRows, lotsRows, mouvementsRows,
  });
  console.log(`6. ✓ MADABEL 2606027 — 3 lignes · ${total.toLocaleString("fr-FR")} Ar`);
}

/* ── État après ─────────────────────────────────────────────────────── */
const apres = await listProduitsAvecStock();
console.log("\n── État après ──");
for (const id of ["PHA-077", "PHA-078", "PHA-059", APDYL_ID, "PHA-047", "PHA-029", "PHA-045", "PHA-068", "PHA-069", "PHA-070"]) {
  const x = apres.find((y) => y.id === id);
  if (x) console.log(`  ${id} ${x.designation.padEnd(30)} stock ${String(x.stockBase).padStart(4)}`);
}
