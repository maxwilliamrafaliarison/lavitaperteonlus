#!/usr/bin/env node
/**
 * Renomme les salles REX selon la référence officielle fournie par Max
 * (numérotation réelle de l'ONG) et crée les 2 stocks manquants.
 *
 * Usage :
 *   node scripts/rename-rooms.mjs            # dry-run + audit matériels à bouger
 *   node scripts/rename-rooms.mjs --commit   # écriture réelle
 */

import { config } from "dotenv";
import { google } from "googleapis";

config({ path: ".env.local" });
config({ path: ".env" });

const COMMIT = process.argv.includes("--commit");

// Nouvelle référence officielle (Max, 2026-04-21)
const ROOM_RENAMES = {
  room_rex_00: { name: "Accueil", service: "Accueil" },
  room_rex_01: { name: "Réunion", service: "Administration" },
  room_rex_02: { name: "Mammographie", service: "Médical / Imagerie" },
  room_rex_03: { name: "Direction", service: "Direction" },
  room_rex_04: { name: "Échographie", service: "Médical / Imagerie" },
  room_rex_05: { name: "Logistique", service: "Logistique" },
  room_rex_06: { name: "Bureau Dr Alice — Salle de consultation", service: "Médical" },
  room_rex_07: { name: "Comptabilité / Administration", service: "Administration" },
  room_rex_08: { name: "Pédiatrique", service: "Médical" },
  room_rex_09: { name: "Laboratoire d'analyse / anatomopathologique", service: "Labo" },
  room_rex_10: { name: "CPN — Consultation Pré-Natale", service: "Médical" },
  room_rex_11: { name: "Pap-test", service: "Médical" },
  room_rex_labgal: { name: "Laboratoire Galénique", service: "Médical / Labo" },
  room_rex_sous_sol: { name: "Stock sous sol", service: "Logistique / Stockage" },
};

// Nouvelles salles stock (sans numéro)
const NEW_ROOMS = [
  // [id, siteId, code, name, floor, service, ipRange]
  ["room_rex_stock_mamo", "site_rex", "SM", "Stock Mamo", "RDC", "Logistique / Stockage", ""],
  ["room_rex_stock_accueil", "site_rex", "SA", "Stock Accueil", "RDC", "Logistique / Stockage", ""],
];

const sheetId = process.env.GOOGLE_SHEET_ID;
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const key = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
if (!sheetId || !email || !key) {
  console.error("❌ .env.local incomplet");
  process.exit(1);
}

const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

function colLetter(idx) {
  let s = "";
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

// 1) Lecture salles
console.log("📂 Lecture onglet rooms...");
console.log("  [1/4] fetching rooms...");
const roomsRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "rooms!A1:ZZ" });
console.log("  [1/4] rooms fetched:", (roomsRes.data.values ?? []).length, "rows");
const roomRows = roomsRes.data.values ?? [];
const [roomHeaders, ...roomData] = roomRows;
const idIdx = roomHeaders.indexOf("id");
const nameIdx = roomHeaders.indexOf("name");
const serviceIdx = roomHeaders.indexOf("service");

const existingIds = new Set();
const updates = [];
const unchanged = [];
const unmentioned = [];

for (let i = 0; i < roomData.length; i++) {
  const row = roomData[i];
  const rowNumber = i + 2; // 1-based (row 1 = headers)
  const id = row[idIdx];
  existingIds.add(id);
  const currentName = row[nameIdx] ?? "";
  const currentService = row[serviceIdx] ?? "";

  if (id in ROOM_RENAMES) {
    const target = ROOM_RENAMES[id];
    if (currentName === target.name && currentService === target.service) {
      unchanged.push({ id, name: currentName });
    } else {
      updates.push({
        id, rowNumber,
        from: { name: currentName, service: currentService },
        to: target,
      });
    }
  } else {
    unmentioned.push({ id, name: currentName });
  }
}

// 2) Affichage
console.log(`\n✏️  ${updates.length} salle(s) à renommer :`);
updates.forEach((u) => {
  console.log(`  ${u.id}`);
  if (u.from.name !== u.to.name) console.log(`    name    : "${u.from.name}" → "${u.to.name}"`);
  if (u.from.service !== u.to.service) console.log(`    service : "${u.from.service}" → "${u.to.service}"`);
});

if (unchanged.length > 0) {
  console.log(`\n✅ ${unchanged.length} salle(s) déjà conforme(s) :`);
  unchanged.forEach((u) => console.log(`  ${u.id.padEnd(25)} ${u.name}`));
}

const newToAdd = NEW_ROOMS.filter((r) => !existingIds.has(r[0]));
if (newToAdd.length > 0) {
  console.log(`\n➕ ${newToAdd.length} nouvelle(s) salle(s) à créer :`);
  newToAdd.forEach((r) => console.log(`  ${r[0].padEnd(25)} ${r[3]}`));
}

if (unmentioned.length > 0) {
  console.log(`\n⚠️  ${unmentioned.length} salle(s) NON mentionnée(s) dans la référence (laissées intactes) :`);
  unmentioned.forEach((u) => console.log(`  ${u.id.padEnd(25)} ${u.name}`));
}

// 3) Audit matériels — liste ceux potentiellement mal placés après rename
//    (ex: un matériel dont la designation suggère "mammo" mais qui est dans
//    room_rex_01 qui vient d'être renommée "Réunion")
console.log(`\n🔍 Audit matériels à examiner manuellement après rename...`);
console.log("  [2/4] fetching materials...");
const matsRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "materials!A1:ZZ" });
console.log("  [2/4] materials fetched:", (matsRes.data.values ?? []).length, "rows");
const matRows = matsRes.data.values ?? [];
const [matH, ...matData] = matRows;
const matRoomIdIdx = matH.indexOf("roomId");
const matDesigIdx = matH.indexOf("designation");
const matRefIdx = matH.indexOf("ref");

// Pour chaque paire "swap" : si un matos est dans la salle A et sa désignation matche,
// il doit aller dans la salle B (et inversement).
const SWAP_PAIRS = [
  // room_01 (→Réunion) ↔ room_02 (→Mammo)
  {
    roomA: "room_rex_01", roomB: "room_rex_02",
    keywordsForB: ["mammo", "mammographie"],     // matos mammo actuellement en 01 → doit aller en 02
    keywordsForA: ["réunion", "reunion"],         // matos réunion actuellement en 02 → doit aller en 01
  },
];

// Flatten pour l'audit
const SUSPECT_KEYWORDS = {};
for (const pair of SWAP_PAIRS) {
  SUSPECT_KEYWORDS[pair.roomA] = pair.keywordsForB;  // matos suspects dans A (destinés à B)
  SUSPECT_KEYWORDS[pair.roomB] = pair.keywordsForA;  // matos suspects dans B (destinés à A)
}

const matIdIdx = matH.indexOf("id");
const matUpdatedAtIdx = matH.indexOf("updatedAt");

const suspects = [];
for (let i = 0; i < matData.length; i++) {
  const m = matData[i];
  const currentRoom = m[matRoomIdIdx];
  const designation = String(m[matDesigIdx] ?? "").toLowerCase();

  // Détermine la salle cible selon la SWAP_PAIRS
  let targetRoom = null;
  for (const pair of SWAP_PAIRS) {
    if (currentRoom === pair.roomA && pair.keywordsForB.some((k) => designation.includes(k))) {
      targetRoom = pair.roomB;
      break;
    }
    if (currentRoom === pair.roomB && pair.keywordsForA.some((k) => designation.includes(k))) {
      targetRoom = pair.roomA;
      break;
    }
  }

  if (targetRoom) {
    suspects.push({
      ref: m[matRefIdx],
      id: m[matIdIdx],
      rowNumber: i + 2,
      designation: m[matDesigIdx],
      currentRoom,
      targetRoom,
      newCurrentLabel: ROOM_RENAMES[currentRoom]?.name ?? "—",
      newTargetLabel: ROOM_RENAMES[targetRoom]?.name ?? "—",
    });
  }
}

if (suspects.length > 0) {
  console.log(`\n🔁 ${suspects.length} matériel(s) à déplacer automatiquement (swap cohérent avec le rename) :`);
  suspects.forEach((s) => {
    console.log(`    ${s.ref.padEnd(22)} ${s.currentRoom} → ${s.targetRoom}`);
    console.log(`       ${s.designation}`);
  });
} else {
  console.log("  ✅ Aucun matériel à swapper.");
}

if (!COMMIT) {
  console.log("\n🟡 DRY RUN — relancez avec --commit pour écrire.");
  process.exit(0);
}

// 4) Écriture renames + nouvelles salles
console.log("\n📤 Écriture...");

const nameCol = colLetter(nameIdx);
const serviceCol = colLetter(serviceIdx);
const data = [];
for (const u of updates) {
  if (u.from.name !== u.to.name) data.push({ range: `rooms!${nameCol}${u.rowNumber}`, values: [[u.to.name]] });
  if (u.from.service !== u.to.service) data.push({ range: `rooms!${serviceCol}${u.rowNumber}`, values: [[u.to.service]] });
}

if (data.length > 0) {
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
  console.log(`  ✅ ${updates.length} salle(s) renommée(s).`);
}

if (newToAdd.length > 0) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "rooms!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: newToAdd },
  });
  console.log(`  ✅ ${newToAdd.length} nouvelle(s) salle(s) ajoutée(s).`);
}

// 5) Swap des matériels suspects
if (suspects.length > 0) {
  const now = new Date().toISOString();
  const matRoomIdCol = colLetter(matRoomIdIdx);
  const matUpdatedAtCol = matUpdatedAtIdx >= 0 ? colLetter(matUpdatedAtIdx) : null;

  const matMoveData = suspects.flatMap((s) => {
    const entries = [
      { range: `materials!${matRoomIdCol}${s.rowNumber}`, values: [[s.targetRoom]] },
    ];
    if (matUpdatedAtCol) {
      entries.push({ range: `materials!${matUpdatedAtCol}${s.rowNumber}`, values: [[now]] });
    }
    return entries;
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { valueInputOption: "USER_ENTERED", data: matMoveData },
  });
  console.log(`  ✅ ${suspects.length} matériel(s) déplacé(s) vers la bonne salle.`);

  // Log des mouvements pour traçabilité (best-effort, non bloquant)
  try {
    const movementRows = suspects.map((s) => [
      `mov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      s.id,
      "transfert_salle",
      "site_rex", s.currentRoom, "",
      "site_rex", s.targetRoom, "",
      "u_admin_001",
      "Correction automatique des noms de salles (rename-rooms.mjs)",
      now,
    ]);
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "movements!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: movementRows },
    });
    console.log(`  ✅ ${movementRows.length} mouvement(s) loggé(s) dans movements.`);
  } catch (e) {
    console.log(`  ⚠️  Log des mouvements raté : ${e.message ?? e}`);
  }
}
