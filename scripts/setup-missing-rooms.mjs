#!/usr/bin/env node
/**
 * ============================================================
 * SETUP MISSING ROOMS — ajoute les salles nécessaires à l'import
 * ============================================================
 *
 * À lancer une seule fois AVANT `import-inventory.mjs --commit`.
 * Utilise .env.local (même credentials que l'import).
 *
 * Ajoute à l'onglet `rooms` du Sheet les 3 salles manquantes :
 *   - room_rex_sous_sol     (Stock sous sol, ~59 matériels à rapatrier)
 *   - room_rex_couloir      (Couloir / Siège / Sécurité, ~10 matériels)
 *   - room_miaraka_ankofafa (Centre Miaraka Ankofafa, ~2 matériels)
 *
 * Si une salle existe déjà (même id), elle est IGNORÉE (idempotent).
 *
 * Usage :
 *   node scripts/setup-missing-rooms.mjs --commit
 *   (sans --commit : dry-run, montre ce qui serait ajouté)
 * ============================================================
 */

import { config } from "dotenv";
import { google } from "googleapis";

// Charge .env.local en priorité, puis .env en fallback
config({ path: ".env.local" });
config({ path: ".env" });

const COMMIT = process.argv.includes("--commit");

const NEW_ROOMS = [
  // [id, siteId, code, name, floor, service, ipRange]
  ["room_rex_sous_sol", "site_rex", "SS", "Stock sous sol", "Sous-sol", "Logistique / Stockage", ""],
  ["room_rex_couloir", "site_rex", "COU", "Couloir / Siège / Sécurité", "RDC", "Commun", ""],
  ["room_miaraka_ankofafa", "site_miaraka", "ANK", "Centre Miaraka Ankofafa", "", "Éducation", ""],
];

const sheetId = process.env.GOOGLE_SHEET_ID;
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const key = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

if (!sheetId || !email || !key) {
  console.error("❌ Variables d'environnement manquantes. Créez .env.local avec GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY.");
  process.exit(1);
}

const auth = new google.auth.JWT({
  email,
  key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// 1. Lire les IDs existants pour éviter les doublons
console.log("📂 Lecture des salles existantes...");
const existingRes = await sheets.spreadsheets.values.get({
  spreadsheetId: sheetId,
  range: "rooms!A:A",
});
const existingIds = new Set(
  (existingRes.data.values ?? []).flat().filter(Boolean).map(String),
);

const toAdd = NEW_ROOMS.filter((row) => !existingIds.has(row[0]));
const skipped = NEW_ROOMS.filter((row) => existingIds.has(row[0]));

if (skipped.length > 0) {
  console.log(`\n⏭️  Salles déjà présentes (ignorées) :`);
  skipped.forEach((r) => console.log(`   - ${r[0]} (${r[3]})`));
}

if (toAdd.length === 0) {
  console.log("\n✅ Toutes les salles nécessaires sont déjà dans le Sheet. Rien à faire.");
  process.exit(0);
}

console.log(`\n📝 Salles à ajouter (${toAdd.length}) :`);
toAdd.forEach((r) => console.log(`   - ${r[0].padEnd(25)} ${r[3]}`));

if (!COMMIT) {
  console.log("\n🟡 DRY RUN — relancez avec --commit pour écrire réellement.");
  process.exit(0);
}

console.log("\n📤 Écriture dans le Sheet...");
await sheets.spreadsheets.values.append({
  spreadsheetId: sheetId,
  range: "rooms!A1",
  valueInputOption: "USER_ENTERED",
  requestBody: { values: toAdd },
});
console.log(`✅ ${toAdd.length} salle(s) ajoutée(s).`);
