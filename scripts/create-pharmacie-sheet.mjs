#!/usr/bin/env node
/**
 * Crée le spreadsheet dédié Pharmacie (séparé de la Logistique pour
 * isoler quotas et permissions), pose les 7 onglets + en-têtes, et
 * seed les 65 produits de l'Excel (statut a_detruire pour les périmés)
 * + 1 lot et 1 mouvement d'entrée initial par produit.
 *
 * Architecture append-only : le stock n'est PAS une cellule modifiable,
 * il se recalcule depuis l'onglet mouvements (élimine les conflits
 * d'écriture entre 2 caisses simultanées).
 *
 * Usage :
 *   node scripts/create-pharmacie-sheet.mjs <SHEET_ID_OU_URL>
 *
 * Le service account ne peut pas créer de fichiers (Drive API off) :
 * créer un classeur vide depuis un compte humain, le partager en
 * Éditeur à lavitaperte-sheets@lavitaperte-dashboard.iam.gserviceaccount.com,
 * puis lancer ce script avec son URL. Il pose les onglets, les
 * en-têtes et le seed.
 * Sortie : PHARMACIE_SHEET_ID à mettre dans .env.local + Vercel.
 */

import { config } from "dotenv";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });

const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
const SHARE_WITH = "informatique.lavitaperte@gmail.com";
const SEED_PATH =
  "/private/tmp/claude-501/-Users-maxwilliamrafaliarison-Library-CloudStorage-OneDrive-Personnel-Documents-Centre-REX/48e62b6c-f6f0-486f-94aa-f95a906e8f84/scratchpad/pharmacie-seed.json";

const b64url = (i) =>
  Buffer.from(i).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

function makeJWT(scope) {
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: SA_EMAIL, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }),
  )}`;
  const sig = crypto.createSign("RSA-SHA256").update(data).sign(SA_KEY)
    .toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${data}.${sig}`;
}

async function fetchRetry(url, options = {}, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(t);
      return res;
    } catch (e) {
      console.error(`  ⟳ tentative ${i + 1}/${tries} (${e.cause?.code ?? e.name})`);
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
}

async function getToken(scope) {
  const res = await fetchRetry("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: makeJWT(scope),
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("token: " + JSON.stringify(j));
  return j.access_token;
}

// ---------------------------------------------------------------
const TABS = {
  produits: ["id", "code", "designation", "dci", "classe", "forme", "dosage", "conditionnement", "prix_achat", "prix_vente", "prix_unitaire", "stock_min", "fournisseur", "emplacement", "statut", "createdAt"],
  lots: ["id", "produit_id", "numero_lot", "date_expiration", "date_reception"],
  mouvements: ["id", "timestamp", "produit_id", "lot_id", "type", "quantite", "prix_unitaire", "reference", "user_email", "note"],
  ventes: ["id", "timestamp", "client_nom", "type_vente", "total", "operateur_email", "statut"],
  lignes_vente: ["id", "vente_id", "produit_id", "lot_id", "quantite", "prix_unitaire", "sous_total"],
  fournisseurs: ["id", "nom", "telephone", "email", "adresse"],
  parametres: ["cle", "valeur"],
};

const products = JSON.parse(readFileSync(SEED_PATH, "utf8"));
const now = new Date().toISOString();
const pad = (n) => String(n).padStart(3, "0");

const produitsRows = products.map((p, i) => [
  `PHA-${pad(i + 1)}`, `PHA-${pad(i + 1)}`, p.designation, p.dci, p.classe, p.forme,
  p.dosage, p.conditionnement, p.prix_achat, p.prix_vente, p.prix_unitaire,
  p.stock_min, p.fournisseur, p.emplacement, p.statut, now,
]);

const lotsRows = products.map((p, i) => [
  `LOT-${pad(i + 1)}`, `PHA-${pad(i + 1)}`, p.lot || `IMPORT-${pad(i + 1)}`,
  p.date_expiration, p.date_reception,
]);

const mouvementsRows = products.map((p, i) => [
  `MVT-${pad(i + 1)}`, now, `PHA-${pad(i + 1)}`, `LOT-${pad(i + 1)}`,
  "entree", p.quantite, p.prix_unitaire || p.prix_vente, "import-excel-2026-07",
  "system", "Reprise stock initial depuis _Base de Données Pharmacie.xlsx",
]);

const parametresRows = [
  ["email_rapports_destinataires", ""],
  ["email_rapports_frequence", "hebdomadaire"],
  ["devise", "Ar"],
  ["seuil_peremption_jours", "90"],
];

// ---------------------------------------------------------------
const arg = process.argv[2];
if (!arg) {
  console.error("❌ Donne l'ID ou l'URL du classeur vide partagé au service account.");
  console.error("   node scripts/create-pharmacie-sheet.mjs <SHEET_ID_OU_URL>");
  process.exit(1);
}
const ID = arg.includes("docs.google.com")
  ? arg.match(/\/d\/([A-Za-z0-9_-]+)/)?.[1]
  : arg;
if (!ID) { console.error("❌ URL invalide"); process.exit(1); }

console.log("1/3 · Création des onglets dans", ID.slice(0, 12) + "…");
const token = await getToken("https://www.googleapis.com/auth/spreadsheets");

// Lit les onglets existants pour être idempotent
const metaRes = await fetchRetry(
  `https://sheets.googleapis.com/v4/spreadsheets/${ID}?fields=sheets.properties.title`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const meta = await metaRes.json();
if (meta.error) throw new Error("accès refusé : partage le classeur au service account d'abord. " + JSON.stringify(meta.error).slice(0, 150));
const existing = new Set((meta.sheets ?? []).map((s) => s.properties.title));

const addRequests = Object.keys(TABS)
  .filter((t) => !existing.has(t))
  .map((title, i) => ({
    addSheet: { properties: { title, index: i, gridProperties: { frozenRowCount: 1 } } },
  }));

if (addRequests.length > 0) {
  const addRes = await fetchRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${ID}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: addRequests }),
    },
  );
  const added = await addRes.json();
  if (added.error) throw new Error("addSheets: " + JSON.stringify(added.error).slice(0, 200));
}
console.log(`   ✓ ${addRequests.length} onglet(s) créé(s)`);

console.log("2/3 · Écriture en-têtes + seed (batch unique)…");
const data = [
  ...Object.entries(TABS).map(([tab, headers]) => ({ range: `${tab}!A1`, values: [headers] })),
  { range: "produits!A2", values: produitsRows },
  { range: "lots!A2", values: lotsRows },
  { range: "mouvements!A2", values: mouvementsRows },
  { range: "parametres!A2", values: parametresRows },
];
const batchRes = await fetchRetry(
  `https://sheets.googleapis.com/v4/spreadsheets/${ID}/values:batchUpdate`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  },
);
const batch = await batchRes.json();
if (!batch.totalUpdatedCells) throw new Error("batch: " + JSON.stringify(batch).slice(0, 300));
console.log(`   ✓ ${batch.totalUpdatedCells} cellules écrites`);

console.log("3/3 · (le classeur t'appartient déjà, pas de partage à faire)");

console.log("\n" + "=".repeat(64));
console.log("PHARMACIE_SHEET_ID=" + ID);
console.log("URL : https://docs.google.com/spreadsheets/d/" + ID + "/edit");
console.log("=".repeat(64));
console.log("→ Ajoute PHARMACIE_SHEET_ID dans .env.local ET dans Vercel.");
