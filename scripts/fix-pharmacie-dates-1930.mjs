#!/usr/bin/env node
/**
 * Corrige le bug Excel des années 2 chiffres : les péremptions saisies
 * « xx/xx/30 » ont été lues 1930 au lieu de 2030 (pivot Excel = 29).
 * - lots.date_expiration : 1930-* → 2030-*
 * - produits.statut : a_detruire → actif pour les produits concernés
 *   (ils ne sont pas périmés)
 *
 * Usage : node scripts/fix-pharmacie-dates-1930.mjs
 */

import { config } from "dotenv";
import crypto from "node:crypto";

config({ path: ".env.local" });

const ID = process.env.PHARMACIE_SHEET_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

const b64url = (i) =>
  Buffer.from(i).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

async function fetchRetry(url, options = {}, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(t);
      return res;
    } catch (e) {
      console.error(`  ⟳ ${i + 1}/${tries} (${e.cause?.code ?? e.name})`);
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
}

const now = Math.floor(Date.now() / 1000);
const jwtData = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
  JSON.stringify({
    iss: SA_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }),
)}`;
const sig = crypto.createSign("RSA-SHA256").update(jwtData).sign(SA_KEY)
  .toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const tok = await (
  await fetchRetry("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${jwtData}.${sig}`,
    }),
  })
).json();
const H = { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" };

// 1. Lit lots + produits
const read = async (range) =>
  (await (await fetchRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${ID}/values/${encodeURIComponent(range)}`,
    { headers: H },
  )).json()).values ?? [];

const lots = await read("lots!A1:E");
const produits = await read("produits!A1:P");

const lotHeaders = lots[0];
const expIdx = lotHeaders.indexOf("date_expiration");
const prodIdIdx = lotHeaders.indexOf("produit_id");

const updates = [];
const produitsConcernes = new Set();

lots.forEach((row, i) => {
  if (i === 0) return;
  const exp = row[expIdx] ?? "";
  if (String(exp).startsWith("1930-")) {
    const fixed = "2030-" + String(exp).slice(5);
    // Colonne D (date_expiration = index 3) → ligne i+1
    updates.push({ range: `lots!D${i + 1}`, values: [[fixed]] });
    produitsConcernes.add(row[prodIdIdx]);
    console.log(`  lot ligne ${i + 1} : ${exp} → ${fixed} (${row[prodIdIdx]})`);
  }
});

const prodHeaders = produits[0];
const statutIdx = prodHeaders.indexOf("statut");
const idIdx = prodHeaders.indexOf("id");
const desIdx = prodHeaders.indexOf("designation");
const statutCol = String.fromCharCode(65 + statutIdx); // O si index 14

produits.forEach((row, i) => {
  if (i === 0) return;
  if (produitsConcernes.has(row[idIdx]) && row[statutIdx] === "a_detruire") {
    updates.push({ range: `produits!${statutCol}${i + 1}`, values: [["actif"]] });
    console.log(`  produit ${row[idIdx]} (${row[desIdx]}) : a_detruire → actif`);
  }
});

if (updates.length === 0) {
  console.log("Rien à corriger.");
  process.exit(0);
}

const res = await fetchRetry(
  `https://sheets.googleapis.com/v4/spreadsheets/${ID}/values:batchUpdate`,
  {
    method: "POST",
    headers: H,
    body: JSON.stringify({ valueInputOption: "RAW", data: updates }),
  },
);
const result = await res.json();
if (result.error) throw new Error(JSON.stringify(result.error).slice(0, 200));
console.log(`\n✅ ${result.totalUpdatedCells} cellules corrigées (${produitsConcernes.size} produits réhabilités).`);
