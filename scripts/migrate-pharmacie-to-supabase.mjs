#!/usr/bin/env node
/**
 * Migration Pharmacie : Google Sheets (PHARMACIE_SHEET_ID) → Supabase
 * (schéma pharmacie). Lit les 7 onglets et les insère tels quels, en
 * castant les colonnes numériques. Idempotent par TRUNCATE préalable
 * (voir --truncate qui vide via PostgREST avant réinsertion).
 *
 * Prérequis :
 *   1. Migration 003_pharmacie.sql exécutée
 *   2. Schéma `pharmacie` exposé dans Data API → Settings
 *   3. .env.local : PHARMACIE_SHEET_ID + credentials Google
 *      + SUPABASE_URL/KEY (ou PATIENTS_SUPABASE_URL/KEY)
 *
 * Usage : node scripts/migrate-pharmacie-to-supabase.mjs [--truncate] [--dry-run]
 */

import { config } from "dotenv";
import crypto from "node:crypto";

config({ path: ".env.local" });

const SHEET_ID = process.env.PHARMACIE_SHEET_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
const SB_URL = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SB_KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");

if (!SHEET_ID || !SA_EMAIL || !SA_KEY || !SB_URL || !SB_KEY) {
  console.error("❌ Config incomplète (.env.local) : PHARMACIE_SHEET_ID, credentials Google, SUPABASE_URL/KEY");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const doTruncate = process.argv.includes("--truncate");

// Colonnes numériques par table (le reste = text)
const NUM = {
  produits: ["prix_achat", "prix_vente", "prix_unitaire", "stock_min"],
  lots: [],
  mouvements: ["quantite", "prix_unitaire"],
  ventes: ["total"],
  lignes_vente: ["quantite", "prix_unitaire", "sous_total"],
  fournisseurs: [],
  parametres: [],
};
const TABS = Object.keys(NUM);

// --- Google auth (JWT manuel, fetch direct) ---
const b64url = (i) => Buffer.from(i).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
function googleJWT() {
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({
    iss: SA_EMAIL, scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }))}`;
  const sig = crypto.createSign("RSA-SHA256").update(data).sign(SA_KEY)
    .toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${data}.${sig}`;
}
async function fetchRetry(url, opts = {}, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(t);
      return res;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

const gToken = await (await fetchRetry("https://oauth2.googleapis.com/token", {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: googleJWT() }),
})).json();
if (!gToken.access_token) { console.error("❌ Google token:", JSON.stringify(gToken).slice(0, 150)); process.exit(1); }

async function readSheet(tab) {
  const res = await fetchRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tab)}!A1:ZZ`,
    { headers: { Authorization: `Bearer ${gToken.access_token}` } },
  );
  const j = await res.json();
  const rows = j.values ?? [];
  if (rows.length === 0) return [];
  const [headers, ...data] = rows;
  return data
    .filter((r) => r.some((c) => c !== null && c !== ""))
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] ?? ""; });
      return obj;
    });
}

// --- Supabase helpers ---
const SBH = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Profile": "pharmacie", "Content-Type": "application/json" };

async function truncate(table) {
  // Supprime tout (filtre "toujours vrai" via id non nul)
  const res = await fetchRetry(`${SB_URL}/rest/v1/${table}?id=neq.__none__`, {
    method: "DELETE", headers: { ...SBH, Prefer: "return=minimal" },
  });
  if (!res.ok && res.status !== 404) console.log(`  ⚠ truncate ${table}: HTTP ${res.status}`);
}

async function insert(table, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = await fetchRetry(`${SB_URL}/rest/v1/${table}`, {
      method: "POST", headers: { ...SBH, Prefer: "return=minimal" }, body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`insert ${table} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

function cast(table, row) {
  const out = { ...row };
  for (const col of NUM[table]) {
    if (out[col] === "" || out[col] == null) { out[col] = null; }
    else { const n = Number(out[col]); out[col] = Number.isFinite(n) ? n : null; }
  }
  // vides → null pour éviter les "" en text (cohérence)
  for (const k of Object.keys(out)) if (out[k] === "") out[k] = null;
  return out;
}

console.log(`Migration Pharmacie Sheets → Supabase${dryRun ? " [DRY RUN]" : ""}${doTruncate ? " [TRUNCATE]" : ""}\n`);
let grandTotal = 0;
for (const tab of TABS) {
  const rows = await readSheet(tab);
  const casted = rows.map((r) => cast(tab, r));
  console.log(`  ${tab.padEnd(14)} : ${casted.length} lignes`);
  if (!dryRun) {
    if (doTruncate) await truncate(tab);
    await insert(tab, casted);
  }
  grandTotal += casted.length;
}
console.log(`\n${dryRun ? "(dry-run) " : "✅ "}${grandTotal} lignes ${dryRun ? "à migrer" : "migrées"}.`);
