#!/usr/bin/env node
/**
 * Met à jour le nom d'Elisa SALA → "Dr Elisa SALA" dans le Sheet,
 * en utilisant fetch() direct (pas googleapis SDK qui hang sur Node 25).
 *
 * Usage : node scripts/update-elisa-title-fetch.mjs
 */

import { config } from "dotenv";
import crypto from "node:crypto";

config({ path: ".env.local" });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

if (!SHEET_ID || !SA_EMAIL || !SA_KEY) {
  console.error("❌ .env.local incomplet");
  process.exit(1);
}

console.log("✓ env loaded");

// --- 1. Build JWT manually ---
function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function makeJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: SA_EMAIL,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const data = `${header}.${payload}`;
  const sig = crypto.createSign("RSA-SHA256").update(data).sign(SA_KEY);
  const sigB64 = sig
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${data}.${sigB64}`;
}

async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// --- 2. Exchange JWT for access token ---
console.log("✓ JWT built, requesting access token...");
const jwt = makeJWT();
const tokenRes = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  }),
});

if (!tokenRes.ok) {
  console.error("❌ Token request failed:", tokenRes.status, await tokenRes.text());
  process.exit(1);
}

const { access_token } = await tokenRes.json();
console.log("✓ access token obtained");

// --- 3. Read users sheet ---
const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/users!A1:Z`;
const readRes = await fetchWithTimeout(readUrl, {
  headers: { Authorization: `Bearer ${access_token}` },
});

if (!readRes.ok) {
  console.error("❌ Read failed:", readRes.status, await readRes.text());
  process.exit(1);
}

const { values: rows = [] } = await readRes.json();
console.log(`✓ fetched ${rows.length} rows`);

const headers = rows[0];
const emailIdx = headers.indexOf("email");
const nameIdx = headers.indexOf("name");

const target = "direction.lavitaperte@gmail.com";
const rowNum = rows.findIndex(
  (r, i) => i > 0 && (r[emailIdx] ?? "").toLowerCase() === target,
);

if (rowNum < 0) {
  console.error("❌ Elisa introuvable");
  process.exit(1);
}

const current = rows[rowNum][nameIdx];
const newName = "Dr Elisa SALA";

if (current === newName) {
  console.log(`✓ Nom déjà à jour : "${current}"`);
  process.exit(0);
}

console.log(`Row ${rowNum + 1} · "${current}" → "${newName}"`);

// --- 4. Update cell ---
function colLetter(idx) {
  let s = "", n = idx;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

const range = `users!${colLetter(nameIdx)}${rowNum + 1}`;
const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

const updateRes = await fetchWithTimeout(updateUrl, {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ values: [[newName]] }),
});

if (!updateRes.ok) {
  console.error("❌ Update failed:", updateRes.status, await updateRes.text());
  process.exit(1);
}

console.log("✅ Nom mis à jour dans le Sheet.");
process.exit(0);
