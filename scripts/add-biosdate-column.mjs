#!/usr/bin/env node
/**
 * Ajoute la colonne "biosDate" en fin de ligne 1 (header) de l'onglet materials.
 * One-shot, idempotent.
 *
 * Usage :
 *   node scripts/add-biosdate-column.mjs            # dry-run (affiche l'état)
 *   node scripts/add-biosdate-column.mjs --commit   # écriture réelle
 */

import { config } from "dotenv";
import { google } from "googleapis";

config({ path: ".env.local" });
config({ path: ".env" });

const COMMIT = process.argv.includes("--commit");

const sheetId = process.env.GOOGLE_SHEET_ID;
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const key = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
if (!sheetId || !email || !key) {
  console.error("❌ .env.local incomplet");
  process.exit(1);
}

const auth = new google.auth.JWT({
  email, key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

console.log("📂 Lecture header onglet materials...");
const res = await sheets.spreadsheets.values.get({
  spreadsheetId: sheetId,
  range: "materials!1:1",
});
const header = (res.data.values?.[0] ?? []).map(String);

if (header.includes("biosDate")) {
  console.log(`✅ Colonne "biosDate" déjà présente en position ${header.indexOf("biosDate") + 1}. Rien à faire.`);
  process.exit(0);
}

const nextColIdx = header.length; // 0-based → append in column (length+1)

function colLetter(idx) {
  let s = "";
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

const targetCell = `materials!${colLetter(nextColIdx)}1`;
console.log(`📝 Ajout du header "biosDate" en ${targetCell} (position ${nextColIdx + 1})`);

if (!COMMIT) {
  console.log("🟡 DRY RUN — relancez avec --commit pour écrire.");
  process.exit(0);
}

// 1. Étend la grille si nécessaire (max columns par défaut = 26 ou 32)
console.log("  → Extension de la grille (ajout colonne)...");
const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties" });
const materialsSheet = meta.data.sheets?.find((s) => s.properties?.title === "materials");
if (!materialsSheet?.properties) {
  throw new Error("Onglet materials introuvable");
}
const currentCols = materialsSheet.properties.gridProperties?.columnCount ?? 26;
const needCols = nextColIdx + 1;

if (currentCols < needCols) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: [
        {
          appendDimension: {
            sheetId: materialsSheet.properties.sheetId,
            dimension: "COLUMNS",
            length: needCols - currentCols,
          },
        },
      ],
    },
  });
  console.log(`  → Grille étendue : ${currentCols} → ${needCols} colonnes`);
}

// 2. Écrit le nouveau header
await sheets.spreadsheets.values.update({
  spreadsheetId: sheetId,
  range: targetCell,
  valueInputOption: "RAW",
  requestBody: { values: [["biosDate"]] },
});

console.log(`✅ Colonne "biosDate" ajoutée. Les fiches pourront désormais stocker la date du BIOS.`);
