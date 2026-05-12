#!/usr/bin/env node
/**
 * Affiche la ligne utilisateur de Max dans le Sheet.
 */

import { config } from "dotenv";
import crypto from "node:crypto";

config({ path: ".env.local" });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: SA_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const data = `${header}.${payload}`;
  const sig = crypto.createSign("RSA-SHA256").update(data).sign(SA_KEY);
  return `${data}.${sig.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
}

async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

const tokenRes = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: makeJWT(),
  }),
});
const { access_token } = await tokenRes.json();

const readRes = await fetchWithTimeout(
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/users!A1:Z`,
  { headers: { Authorization: `Bearer ${access_token}` } },
);
const { values: rows = [] } = await readRes.json();
const headers = rows[0];

const maxRow = rows.find((r, i) => i > 0 && r[0] === "u_admin_001");
if (!maxRow) {
  console.error("❌ Max introuvable (id u_admin_001)");
  // fallback : cherche un email contenant "max"
  const alt = rows.find((r, i) => i > 0 && (r[1] ?? "").toLowerCase().includes("max"));
  if (alt) {
    console.log("\n→ Trouvé une ligne avec 'max' dans l'email :");
    headers.forEach((h, i) => console.log(`  ${h.padEnd(15)} : ${alt[i] ?? ""}`));
  }
  process.exit(1);
}

console.log("\n👤 Ligne de Max dans le Sheet :\n");
headers.forEach((h, i) => {
  let val = maxRow[i] ?? "";
  if (h === "passwordHash" && val) val = val.slice(0, 12) + "…(masqué)";
  console.log(`  ${h.padEnd(15)} : ${val}`);
});
process.exit(0);
