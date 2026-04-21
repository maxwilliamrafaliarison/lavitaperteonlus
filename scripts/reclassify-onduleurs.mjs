#!/usr/bin/env node
/**
 * Reclasse les matériels actuellement marqués "peripherique" dont la
 * désignation correspond à un onduleur, vers le nouveau type "onduleur".
 *
 * Motif : jusqu'au commit 72ac2a4 le script d'import mettait les
 * onduleurs dans peripherique. Ce correctif rétroactif nettoie la
 * classification dans le Sheet pour des statistiques dashboard plus fines.
 *
 * Usage :
 *   node scripts/reclassify-onduleurs.mjs            # dry-run
 *   node scripts/reclassify-onduleurs.mjs --commit   # écriture réelle
 */

import { config } from "dotenv";
import { google } from "googleapis";

config({ path: ".env.local" });
config({ path: ".env" });

const COMMIT = process.argv.includes("--commit");

const ONDULEUR_KEYWORDS = [
  "onduleur", "ups", "batterie", "régulateur de tension", "regulateur de tension",
];

const sheetId = process.env.GOOGLE_SHEET_ID;
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const key = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
if (!sheetId || !email || !key) {
  console.error("❌ .env.local incomplet");
  process.exit(1);
}

const auth = new google.auth.JWT({
  email,
  key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

console.log("📂 Lecture onglet materials...");
const res = await sheets.spreadsheets.values.get({
  spreadsheetId: sheetId,
  range: "materials!A1:ZZ",
});
const rows = res.data.values ?? [];
if (rows.length === 0) {
  console.log("Sheet vide.");
  process.exit(0);
}

const headers = rows[0];
const idIdx = headers.indexOf("id");
const refIdx = headers.indexOf("ref");
const typeIdx = headers.indexOf("type");
const designationIdx = headers.indexOf("designation");
const updatedAtIdx = headers.indexOf("updatedAt");

if ([idIdx, typeIdx, designationIdx].some((i) => i < 0)) {
  console.error("❌ Colonnes attendues introuvables (id/type/designation)");
  process.exit(1);
}

// Matches : ligne dont type=peripherique ET designation contient un keyword onduleur
const candidates = [];
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const type = String(row[typeIdx] ?? "").toLowerCase();
  const designation = String(row[designationIdx] ?? "").toLowerCase();
  if (type !== "peripherique") continue;
  if (ONDULEUR_KEYWORDS.some((k) => designation.includes(k))) {
    candidates.push({
      rowNumber: i + 1, // 1-based (header = row 1, data start at row 2)
      id: row[idIdx],
      ref: row[refIdx],
      designation: row[designationIdx],
    });
  }
}

console.log(`\n🔍 ${candidates.length} matériel(s) à reclasser peripherique → onduleur :\n`);
candidates.forEach((c, i) => {
  console.log(`  ${String(i + 1).padStart(3)}. ${c.ref.padEnd(24)} ${c.designation}`);
});

if (candidates.length === 0) {
  console.log("\n✅ Rien à reclasser.");
  process.exit(0);
}

if (!COMMIT) {
  console.log("\n🟡 DRY RUN — relancez avec --commit pour écrire.");
  process.exit(0);
}

// Convertit un index 0-based en lettre(s) de colonne A1 (0=A, 25=Z, 26=AA, 30=AE)
function colLetter(idx) {
  let s = "";
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

// Batch update : on ne modifie QUE la colonne type + updatedAt
console.log("\n📤 Écriture...");
const now = new Date().toISOString();
const typeColLetter = colLetter(typeIdx);
const updatedAtColLetter = updatedAtIdx >= 0 ? colLetter(updatedAtIdx) : null;

const data = candidates.flatMap((c) => {
  const entries = [
    { range: `materials!${typeColLetter}${c.rowNumber}`, values: [["onduleur"]] },
  ];
  if (updatedAtColLetter) {
    entries.push({
      range: `materials!${updatedAtColLetter}${c.rowNumber}`,
      values: [[now]],
    });
  }
  return entries;
});

await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: sheetId,
  requestBody: {
    valueInputOption: "USER_ENTERED",
    data,
  },
});

console.log(`✅ ${candidates.length} matériel(s) reclassé(s) en onduleur.`);
