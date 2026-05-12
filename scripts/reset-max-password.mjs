#!/usr/bin/env node
/**
 * Réinitialise le mot de passe de Max (u_admin_001) avec un MDP fort généré,
 * met à jour le hash bcrypt dans le Sheet via fetch() direct,
 * et imprime un email prêt à recevoir.
 *
 * Usage : node scripts/reset-max-password.mjs
 */

import { config } from "dotenv";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

config({ path: ".env.local" });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

if (!SHEET_ID || !SA_EMAIL || !SA_KEY) {
  console.error("❌ .env.local incomplet");
  process.exit(1);
}

// --- MDP fort, lisible, sans caractères confondants ---
function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(14);
  const base = Array.from(bytes.slice(0, 12))
    .map((b) => alphabet[b % alphabet.length])
    .join("");
  const symbol = "!@#$%&*"[bytes[12] % 7];
  const digit = "23456789"[bytes[13] % 8];
  return base + symbol + digit;
}

// --- JWT manuel (contourne googleapis qui hang sur Node 25) ---
function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function makeJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: SA_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const data = `${header}.${payload}`;
  const sig = crypto.createSign("RSA-SHA256").update(data).sign(SA_KEY);
  return `${data}.${sig.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
}

async function fetchWT(url, options = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// 1) access token
const tokenRes = await fetchWT("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: makeJWT(),
  }),
});
if (!tokenRes.ok) {
  console.error("❌ Token fail:", await tokenRes.text());
  process.exit(1);
}
const { access_token } = await tokenRes.json();

// 2) lit la ligne Max
const readRes = await fetchWT(
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/users!A1:Z`,
  { headers: { Authorization: `Bearer ${access_token}` } },
);
const { values: rows = [] } = await readRes.json();
const headers = rows[0];
const idIdx = headers.indexOf("id");
const emailIdx = headers.indexOf("email");
const hashIdx = headers.indexOf("passwordHash");
const nameIdx = headers.indexOf("name");

const rowNum = rows.findIndex((r, i) => i > 0 && r[idIdx] === "u_admin_001");
if (rowNum < 0) {
  console.error("❌ Max (u_admin_001) introuvable");
  process.exit(1);
}

const email = rows[rowNum][emailIdx];
const name = rows[rowNum][nameIdx];

// 3) génère + hash
const newPassword = generatePassword();
const newHash = await bcrypt.hash(newPassword, 12);

// 4) update hash dans le Sheet
function colLetter(idx) {
  let s = "", n = idx;
  while (n >= 0) { s = String.fromCharCode((n % 26) + 65) + s; n = Math.floor(n / 26) - 1; }
  return s;
}
const range = `users!${colLetter(hashIdx)}${rowNum + 1}`;
const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

const updateRes = await fetchWT(updateUrl, {
  method: "PUT",
  headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ values: [[newHash]] }),
});

if (!updateRes.ok) {
  console.error("❌ Update fail:", await updateRes.text());
  process.exit(1);
}

console.log("✅ Hash mis à jour dans le Sheet.\n");

// 5) email prêt
const loginUrl = "https://lavitaperteonlus.vercel.app/login";
const sep = "=".repeat(72);

console.log(sep);
console.log("📧 EMAIL PRÊT À RECEVOIR / FORWARDER");
console.log(sep);
console.log(`\nÀ      : ${email}`);
console.log(`Sujet  : Tes identifiants — Tableau de bord La Vita Per Te\n`);
console.log(`Salut Max,

Voici tes identifiants d'accès au tableau de bord numérique du Centre REX
(compte racine, créé via le système) :

  URL          : ${loginUrl}
  Email        : ${email}
  Mot de passe : ${newPassword}

⚠ Ce mot de passe vient d'être régénéré. Ton ancien MDP ne fonctionne plus.

Connecte-toi puis va dans « Réglages » (avatar en haut à droite → Mes
réglages) pour choisir un mot de passe que toi seul connais.

Conserve cette page dans un gestionnaire de mots de passe.

— Réinitialisation automatique`);

console.log("\n" + sep);
console.log("🔑 RAPPEL");
console.log(sep);
console.log(`  Nom    : ${name}`);
console.log(`  Email  : ${email}`);
console.log(`  MDP    : ${newPassword}`);
console.log(`  Hash   : ${newHash.slice(0, 20)}…(stocké dans le Sheet)\n`);
console.log("⚠️  Ce MDP n'est affiché qu'UNE SEULE FOIS. Copie-le maintenant.");
console.log(sep);
process.exit(0);
