#!/usr/bin/env node
/**
 * Reprise du REGISTRE DES ENTRÉES manuscrit (cahier de la pharmacie) dans
 * l'application — transcription Registre_des_entrees.xlsx (photos 20/07/2026).
 *
 * ── LA règle qui gouverne tout ─────────────────────────────────────────────
 * Le stock initial de l'app a été importé le 13/07/2026 depuis la base
 * d'Eugenio (référence "import-excel-2026-07"), laquelle intégrait déjà les
 * livraisons de juin (preuve : les montants du cahier correspondent à
 * l'Ariary près aux prix de vente du catalogue importé). Donc :
 *   • livraisons AVANT le 13/07 → achats + lignes SEULEMENT (registre
 *     comptable) — re-mouvementer le stock le DOUBLERAIT ;
 *   • livraisons APRÈS le 13/07 → achats + lignes + lots GROS + mouvements
 *     d'entrée (ce stock n'est nulle part ailleurs).
 *
 * Idempotent : identifiants ACH-REG-* dérivés des n° de facture ; le RPC
 * enregistrer_achat ignore un id déjà présent. Relançable sans risque.
 *
 * Usage :
 *   node --env-file=.env.local scripts/import-registre-entrees.mjs           # simulation
 *   node --env-file=.env.local scripts/import-registre-entrees.mjs --apply
 */
import { createRequire } from "node:module";
const XLSX = createRequire(process.cwd() + "/")("xlsx");

const APPLY = process.argv.includes("--apply");
const FICHIER = "/Users/maxwilliamrafaliarison/Downloads/Registre_des_entrees.xlsx";
const DATE_STOCK_INITIAL = "2026-07-13";

const URL_SB = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
if (!URL_SB || !KEY) { console.error("❌ env Supabase manquant"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Accept-Profile": "pharmacie", "Content-Profile": "pharmacie" };
async function pg(method, path, body) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

// ── 1. Lire et regrouper le registre ──────────────────────────────────────
const isoDate = (fr) => { const [j, m, a] = String(fr).split("/"); return `${a}-${m.padStart(2, "0")}-${j.padStart(2, "0")}`; };
const montant = (s) => Number(String(s).replace(/,/g, ""));

const wb = XLSX.readFile(FICHIER);
const brut = XLSX.utils.sheet_to_json(wb.Sheets["Registre des entrées"], { header: 1, raw: false });
let cle = null;
const livraisons = new Map();
for (const r of brut.slice(4)) {
  if (!r || !r[4]) continue;
  if (r[0]) {
    const facture = String(r[2] ?? "").replace(/\n/g, " ").trim();
    cle = `${r[0]}|${r[1]}|${facture}`;
    livraisons.set(cle, { date: isoDate(r[0]), origine: String(r[1]).trim(), facture, lignes: [] });
  }
  livraisons.get(cle).lignes.push({
    designation: String(r[4]).trim(),
    cdt: r[5] ? String(r[5]).trim() : "",
    qte: Number(r[6]),
    peremption: r[7] ? isoDate(r[7]) : "",
    lot: r[8] ? String(r[8]).trim() : "",
    montant: montant(r[9]),
  });
}

// Contrôle transcription : totaux attendus de la feuille Synthèse.
const ATTENDU = {
  "26066137": 1307337, "26066148": 831600, "FV 2609129 / EV 2609133": 786035,
  "FC26-015367": 1119600, "FF-260428": 326963, "CHIRPED (Nov 2025)": 622927,
};
for (const l of livraisons.values()) {
  const somme = l.lignes.reduce((s, x) => s + x.montant, 0);
  if (ATTENDU[l.facture] !== undefined && somme !== ATTENDU[l.facture]) {
    console.error(`❌ ${l.facture} : Σ lignes ${somme} ≠ synthèse ${ATTENDU[l.facture]}`);
    process.exit(1);
  }
}
console.log(`Registre lu : ${livraisons.size} livraisons, ${[...livraisons.values()].reduce((s, l) => s + l.lignes.length, 0)} lignes — totaux conformes à la synthèse ✅\n`);

// ── 2. Rapprochement produits ─────────────────────────────────────────────
// Clé n°1 : le PRIX. Le cahier valorise chaque ligne au prix de vente du
// catalogue (vérifié à l'Ariany près) — c'est ce qui départage les paires
// homonymes (2 DICYNONE, 2 MAXILASE, PRIMPERAN/PRIMERAN…). Repli : alias de
// nom (graphies du cahier ≠ catalogue : Eyevit/EXEVIT, Céfixime/CEFIXINE…).
const produits = await pg("GET", "produits?select=id,designation,fournisseur,prix_vente,facteur_conversion&limit=1000");
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const ALIAS = {
  "eyevit": "EXEVIT C", "itacane": "ITACARE", "x ton 20": "X'TOR-20", "cefixime": "CEFIXINE",
  "prednisolone": "PREDNOVA 20", "amoxicilline acide clavulanique": "ACCUCLAV 625",
  "azythromicine": "AZICURE 250", "desloratadine": "D-LOR", "esomeprazole": "ESOFAG-20",
  "ultralevure": "ULTRA-LEVURE", "amlodipine": "AMNLODIPINE", "compresse sterile": "COMPRESSE STERYL",
  "glucose hyp": "GLUCOSE", "hydrosol polyvit": "HYDROSOL", "seringues 10": "SERINGUE 10ml",
  "seringue 05": "SERINGUE 5ml", "sodium chlorure": "SODIUM CHLORURE  0,9%", "zerodol p": "ZERODOL",
  "ac fusidique": "ACIDE FUSIDIQUE",
};
function rapprocher(ligne) {
  const unitaire = ligne.montant / ligne.qte;
  // prix exact (±1 Ar pour les divisions non entières)
  const parPrix = produits.filter((p) => Math.abs(p.prix_vente - unitaire) <= 1);
  if (parPrix.length === 1) return { p: parPrix[0], via: "prix" };
  const nd = norm(ligne.designation);
  if (parPrix.length > 1) {
    const premierMot = nd.split(" ")[0];
    const affine = parPrix.filter((p) => norm(p.designation).split(" ").some((w) => w.startsWith(premierMot.slice(0, 5))));
    if (affine.length === 1) return { p: affine[0], via: "prix+nom" };
  }
  for (const [alias, cible] of Object.entries(ALIAS)) {
    if (nd.startsWith(alias)) {
      const p = produits.find((x) => x.designation === cible);
      if (p) return { p, via: "alias" };
    }
  }
  const premierMot = nd.split(" ")[0];
  const parNom = produits.filter((p) => norm(p.designation).split(" ")[0] === premierMot);
  if (parNom.length === 1) return { p: parNom[0], via: "nom" };
  return { p: null, via: "aucun" };
}

// ── 3. Les 2 produits du 15/07, absents du catalogue ──────────────────────
// Convention du catalogue respectée : un produit par (marque, fournisseur,
// prix) — cf. MAXILASE ×2, PRIMPERAN/PRIMERAN. Marge uniforme ×1,30 observée
// sur tout le catalogue → prix_achat dérivé du prix de vente du cahier.
const NOUVEAUX = {
  "Rapiclav 625 mg cp": {
    id: "PHA-066", designation: "RAPICLAV 625", dci: "AMOXI+ ACIDE CLAVULANIQUE",
    classe: "ANTIBIOTIQUE", forme: "COMPRIME", dosage: "500mg/125mg",
    conditionnement: "BOITE DE 21", fournisseur: "PHARMATEK",
    prix_vente: 28662, prix_achat: 22048,
  },
  "Ciprofloxacine 500 mg cp": {
    id: "PHA-067", designation: "CIPROFLOXACINE", dci: "CIPROFLOXACINE",
    classe: "ANTIBIOTIQUE", forme: "COMPRIME", dosage: "500mg",
    conditionnement: "BOITE DE 100", fournisseur: "PHARMATEK",
    prix_vente: 21017, prix_achat: 16167,
  },
};

// ── 4. Construire les écritures ───────────────────────────────────────────
const slug = (f) => f.replace(/[^A-Za-z0-9]+/g, "").slice(0, 16).toUpperCase() || "SANSNUM";
let totalLignes = 0, sansProduit = [];
const operations = [];
for (const l of livraisons.values()) {
  const anterieure = l.date < DATE_STOCK_INITIAL;
  const achatId = `ACH-REG-${slug(l.facture)}`;
  // MEDICO : "FV … / EV …" → facture + BL séparés
  const [numFacture, numBl] = l.facture.includes("/")
    ? l.facture.split("/").map((s) => s.trim())
    : [l.facture, ""];
  const lignesRows = [], lotsRows = [], mouvementsRows = [];
  let totalAchat = 0;
  l.lignes.forEach((ligne, i) => {
    totalLignes++;
    totalAchat += ligne.montant;
    // Les créations ne valent QUE pour la livraison postérieure au stock
    // initial (15/07) : la « Ciprofloxacine 500 » de SALAMA (juin) est un
    // AUTRE produit (PHA-053, prix 12 740) que celle de PHARMATEK (21 017).
    const nouveau = anterieure ? undefined : NOUVEAUX[ligne.designation];
    const match = nouveau ? { p: { id: nouveau.id, facteur_conversion: 1 }, via: "création" } : rapprocher(ligne);
    if (!match.p) sansProduit.push(`${l.facture} · ${ligne.designation}`);
    console.log(`  ${anterieure ? "📒" : "📦"} ${ligne.designation.padEnd(45).slice(0, 45)} → ${match.p ? match.p.id : "(sans produit)"} [${match.via}]`);
    lignesRows.push({
      id: `${achatId}-L${i + 1}`, achat_id: achatId, produit_id: match.p?.id ?? "",
      designation: ligne.designation, contenance: ligne.cdt, quantite: ligne.qte,
      date_expiration: ligne.peremption, numero_lot: ligne.lot, montant: ligne.montant,
    });
    if (!anterieure) {
      // Postérieure au stock initial : le stock DOIT bouger (lot GROS + entrée).
      if (!match.p) { console.error(`❌ ${ligne.designation} : produit requis pour mouvementer`); process.exit(1); }
      const f = match.p.facteur_conversion >= 1 ? match.p.facteur_conversion : 1;
      const lotId = `LOT-REG-${slug(l.facture)}-${i + 1}`;
      lotsRows.push({
        id: lotId, produit_id: match.p.id, numero_lot: ligne.lot || lotId,
        date_expiration: ligne.peremption, date_reception: l.date, contenance: ligne.cdt,
      });
      mouvementsRows.push({
        id: `${achatId}-M${i + 1}`, timestamp: `${l.date}T08:00:00.000Z`, produit_id: match.p.id,
        lot_id: lotId, type: "entree", quantite: ligne.qte * f,
        prix_unitaire: Math.round(ligne.montant / (ligne.qte * f)), reference: achatId,
        user_email: "system", note: `Reprise cahier — ${l.origine} ${l.facture}`,
        unite_saisie: "boite", facteur_applique: f, compartiment: "gros",
      });
    }
  });
  const note = anterieure
    ? `Reprise du cahier (photos 20/07/2026). Antérieure au stock initial du ${DATE_STOCK_INITIAL} : registre documentaire, stock NON re-mouvementé (déjà compté à l'import initial).`
    : `Reprise du cahier (photos 20/07/2026). Postérieure au stock initial du ${DATE_STOCK_INITIAL} : stock mouvementé (lots GROS). Mention du registre : « ${l.facture} », pas de n° de facture visible.`;
  operations.push({
    achat: {
      id: achatId, timestamp: `${l.date}T08:00:00.000Z`, date_facture: l.date,
      fournisseur: l.origine, num_facture: numFacture, num_bl: numBl,
      montant_total: totalAchat, operateur_email: "system", statut: "valide", note,
    },
    lignesRows, lotsRows, mouvementsRows, libelle: `${l.date} ${l.origine} ${l.facture}`,
  });
}

console.log(`\n${totalLignes} lignes · ${operations.length} achats`);
if (sansProduit.length) console.log(`⚠️ sans produit rattaché (registre seul, texte conservé) :\n   ${sansProduit.join("\n   ")}`);

if (!APPLY) { console.log("\n(simulation — relancez avec --apply pour écrire)"); process.exit(0); }

// ── 5. Écrire ─────────────────────────────────────────────────────────────
for (const [designation, p] of Object.entries(NOUVEAUX)) {
  const existe = await pg("GET", `produits?id=eq.${p.id}&select=id`);
  if (existe.length) { console.log(`= ${p.id} existe déjà`); continue; }
  await pg("POST", "produits", {
    ...p, code: p.id, statut: "actif", unite_detail: "", facteur_conversion: 1,
    prix_unitaire: null, prix_vente_detail: 0, stock_min: 0, emplacement: "",
    createdAt: new Date().toISOString(),
  });
  console.log(`✅ produit créé : ${p.id} ${p.designation} (${designation})`);
}
for (const op of operations) {
  const r = await pg("POST", "rpc/enregistrer_achat", {
    p_achat: op.achat, p_lignes: op.lignesRows, p_lots: op.lotsRows, p_mouvements: op.mouvementsRows,
  });
  console.log(`✅ ${op.libelle} → ${r} (${op.lignesRows.length} lignes, ${op.mouvementsRows.length} mouvement(s))`);
}

// ── 6. Vérifier ───────────────────────────────────────────────────────────
const achats = await pg("GET", "achats?id=like.ACH-REG-*&select=id,montant_total&order=id.asc");
const lignes = await pg("GET", "achats_lignes?achat_id=like.ACH-REG-*&select=id");
const nbMvts = (await pg("GET", "mouvements?reference=like.ACH-REG-*&select=id")).length;
const total = achats.reduce((s, a) => s + Number(a.montant_total), 0);
console.log(`\nVérification : ${achats.length} achats · ${lignes.length} lignes · ${nbMvts} mouvements · total ${total.toLocaleString("fr-FR")} Ar (attendu 4 994 462)`);
for (const pid of ["PHA-066", "PHA-067"]) {
  const mvts = await pg("GET", `mouvements?produit_id=eq.${pid}&select=quantite`);
  console.log(`  stock ${pid} = ${mvts.reduce((s, m) => s + Number(m.quantite), 0)}`);
}
console.log(total === 4994462 && achats.length === 6 && lignes.length === 67 ? "✅ TOUT CONFORME" : "❌ ÉCART — vérifier");
