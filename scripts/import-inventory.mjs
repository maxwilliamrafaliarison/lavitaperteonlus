#!/usr/bin/env node
/**
 * ============================================================
 * IMPORT INVENTAIRE — Excel REX → Google Sheet (onglet materials)
 * ============================================================
 *
 * Usage :
 *   1. Créez un .env.local à la racine avec :
 *      GOOGLE_SHEET_ID="..."
 *      GOOGLE_SERVICE_ACCOUNT_EMAIL="..."
 *      GOOGLE_PRIVATE_KEY="..."
 *
 *   2. Placez le fichier Excel dans data/ :
 *      mkdir -p data
 *      cp "/chemin/vers/7-INVENTAIRE INOFORMATIQUE REX A JOUR (Juillet 2025).xls" data/inventory.xls
 *
 *   3. Installez les deps si pas déjà :
 *      npm install -D xlsx dotenv
 *
 *   4. Lancez :
 *      node scripts/import-inventory.mjs
 *
 * Le script :
 *   - Lit l'onglet "informatique" du fichier .xls
 *   - Mappe chaque ligne vers le schéma `materials` du Sheet
 *   - Détecte le type (ordinateur, imprimante, routeur…) depuis la désignation
 *   - Mappe la localisation textuelle vers les roomId (REX-Salle 03 → room_rex_03)
 *   - Génère un id unique (id_<ref>) et timestamps
 *   - Effectue un seul appendBatch pour minimiser les API calls
 *
 * ⚠️ DRY-RUN par défaut. Passez --commit pour écrire réellement :
 *      node scripts/import-inventory.mjs --commit
 * ============================================================
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { google } from "googleapis";
import xlsx from "xlsx";

const COMMIT = process.argv.includes("--commit");
const FILE = process.argv.find((a) => a.startsWith("--file="))?.slice(7)
  ?? "data/inventory.xls";

// --- Mappings -----------------------------------------------
const TYPE_KEYWORDS = [
  { keys: ["ordinateur fixe", "ordinateur de bureau", "desktop"], type: "ordinateur_fixe" },
  { keys: ["ordinateur portable", "laptop"], type: "ordinateur_portable" },
  { keys: ["ordinateur bdd"], type: "ordinateur_bdd" },
  { keys: ["serveur"], type: "serveur" },
  { keys: ["routeur", "router"], type: "routeur" },
  { keys: ["switch", "fast ethernet"], type: "switch" },
  { keys: ["box", "flybox"], type: "box" },
  { keys: ["imprimante", "printer", "deskjet"], type: "imprimante" },
  { keys: ["scan", "scanner"], type: "scanner" },
  { keys: ["telephone", "téléphone", "phone"], type: "telephone" },
  { keys: ["ecran", "écran", "moniteur", "monitor"], type: "ecran" },
  { keys: ["usb", "câble", "adapter", "capteur", "disque"], type: "peripherique" },
];

function inferType(designation) {
  const d = (designation ?? "").toLowerCase();
  for (const { keys, type } of TYPE_KEYWORDS) {
    if (keys.some((k) => d.includes(k))) return type;
  }
  return "autre";
}

const ROOM_MAP = {
  // Mappings textuels vers les ids créés par setupSheet()
  "salle3": "room_rex_03",
  "salle 3": "room_rex_03",
  "salle3-direction": "room_rex_03",
  "salle 03": "room_rex_03",
  "direction": "room_rex_03",
  "salle 01": "room_rex_01",
  "mammo": "room_rex_01",
  "mammographie": "room_rex_01",
  "salle 02": "room_rex_02",
  "salle de réunion": "room_rex_02",
  "salle 04": "room_rex_04",
  "salle 05": "room_rex_05",
  "porte 5": "room_rex_05",
  "logistique": "room_rex_05",
  "echo": "room_rex_05",
  "salle 06": "room_rex_06",
  "dr alice": "room_rex_06",
  "salle 07": "room_rex_07",
  "porte 7": "room_rex_07",
  "administration": "room_rex_07",
  "comptabilite": "room_rex_07",
  "salle 08": "room_rex_08",
  "pediatrie": "room_rex_08",
  "salle 09": "room_rex_09",
  "labo": "room_rex_09",
  "labo galenique": "room_rex_labgal",
  "salle 10": "room_rex_10",
  "accueil": "room_rex_00",
  "centre miaraka": "room_miaraka_garcons",
  "centre miaraka ambatolahikosoa": "room_miaraka_garcons",
};

function inferRoom(localisation) {
  const norm = (localisation ?? "").toLowerCase().trim()
    .replace(/[éèê]/g, "e").replace(/[àâ]/g, "a");
  for (const key of Object.keys(ROOM_MAP).sort((a, b) => b.length - a.length)) {
    if (norm.includes(key)) return ROOM_MAP[key];
  }
  return "";
}

function inferSiteFromRoom(roomId) {
  if (roomId.startsWith("room_miaraka")) return "site_miaraka";
  return "site_rex";
}

function excelDateToISO(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" && value > 30000) {
    // Excel serial date
    const ms = (value - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return String(value);
}

// --- Lecture Excel ------------------------------------------
console.log(`📂 Lecture de ${FILE}...`);
const workbook = xlsx.read(readFileSync(FILE), { type: "buffer", cellDates: false });
const sheetName = workbook.SheetNames.find((n) => /informatique/i.test(n))
  ?? workbook.SheetNames[0];
const ws = workbook.Sheets[sheetName];
const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });
console.log(`✅ ${rows.length} lignes lues depuis l'onglet "${sheetName}"`);

// --- Transformation -----------------------------------------
const now = new Date().toISOString();
const materials = rows
  .filter((r) => r["REF"] || r["ref"])
  .map((r, i) => {
    const ref = String(r["REF"] ?? r["ref"] ?? "").trim();
    const designation = String(r["Désignation"] ?? r["designation"] ?? "").trim();
    const localisation = String(r["Localisation"] ?? r["localisation"] ?? "").trim();
    const roomId = inferRoom(localisation);
    const siteId = inferSiteFromRoom(roomId);
    const type = inferType(designation);

    return [
      `mat_${ref.replace(/[^a-zA-Z0-9]/g, "_")}`,         // id
      ref,                                                 // ref
      type,                                                // type
      designation,                                         // designation
      String(r["Marque"] ?? "").trim(),                    // brand
      "",                                                  // model
      String(r["Num de série "] ?? r["Num de série"] ?? "").trim(), // serialNumber
      siteId,                                              // siteId
      roomId,                                              // roomId
      String(r["Service"] ?? "").trim(),                   // service
      String(r["Origine ou Propriétaire "] ?? r["Origine ou Propriétaire"] ?? "").trim(), // owner
      "",                                                  // assignedTo
      excelDateToISO(r["Date d'achat  ou arrivée"] ?? r["Date d'achat ou arrivée"]), // purchaseDate
      typeof r["Cout\n(VAT incl.)"] === "number" ? r["Cout\n(VAT incl.)"] : "", // purchasePrice
      String(r["Ammortisement?"] ?? r["Amortisement?"] ?? "").trim(), // amortization
      "",                                                  // os (à enrichir manuellement)
      "",                                                  // cpu
      "",                                                  // ram
      "",                                                  // storage
      "",                                                  // ipAddress
      "",                                                  // macAddress
      "",                                                  // internetAccess
      "",                                                  // linkedToBDD
      "operationnel",                                      // state (par défaut)
      String(r["Remarque"] ?? "").trim(),                  // notes
      "",                                                  // photos
      r["Quantite 2023"] || "",                            // quantity2023
      r["Quantite 2024"] || "",                            // quantity2024
      r["Quantite 2025"] || "",                            // quantity2025
      now,                                                 // createdAt
      now,                                                 // updatedAt
      "",                                                  // deletedAt
    ];
  });

console.log(`🔧 ${materials.length} matériels transformés.`);

// Statistiques
const byType = materials.reduce((acc, m) => {
  acc[m[2]] = (acc[m[2]] || 0) + 1;
  return acc;
}, {});
const byRoom = materials.reduce((acc, m) => {
  const k = m[8] || "(sans salle)";
  acc[k] = (acc[k] || 0) + 1;
  return acc;
}, {});

console.log("\n📊 Répartition par type :");
Object.entries(byType).sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`   ${k.padEnd(25)} ${v}`));
console.log("\n📊 Répartition par salle :");
Object.entries(byRoom).sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`   ${k.padEnd(25)} ${v}`));

// --- Écriture vers Google Sheet -----------------------------
if (!COMMIT) {
  console.log("\n🟡 DRY RUN — aucune écriture. Relancez avec --commit pour écrire.");
  console.log(`   Aperçu première ligne :\n   ${JSON.stringify(materials[0])}`);
  process.exit(0);
}

const sheetId = process.env.GOOGLE_SHEET_ID;
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const key = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
if (!sheetId || !email || !key) {
  console.error("❌ Variables d'environnement manquantes.");
  process.exit(1);
}

const auth = new google.auth.JWT({
  email,
  key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

console.log(`\n📤 Écriture vers Google Sheet (${materials.length} lignes)...`);
await sheets.spreadsheets.values.append({
  spreadsheetId: sheetId,
  range: "materials!A1",
  valueInputOption: "USER_ENTERED",
  requestBody: { values: materials },
});
console.log("✅ Import terminé !");
