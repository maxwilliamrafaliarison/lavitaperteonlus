#!/usr/bin/env node
/**
 * Importe les dossiers patients extraits de FileMaker (um-proto.sqlite)
 * vers Supabase (schema patients, table dossiers), par lots de 500
 * via PostgREST avec la clé service_role.
 *
 * Prérequis :
 *   1. supabase/migrations/001_patients.sql exécuté dans le SQL Editor
 *   2. Dashboard → Settings → API → "Exposed schemas" : ajouter `patients`
 *   3. .env.local : PATIENTS_SUPABASE_URL + PATIENTS_SUPABASE_SERVICE_KEY
 *
 * Usage :
 *   node scripts/import-patients-supabase.mjs [--dry-run] [--limit N]
 */

import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });

const URL_BASE = process.env.PATIENTS_SUPABASE_URL;
const KEY = process.env.PATIENTS_SUPABASE_SERVICE_KEY;
if (!URL_BASE || !KEY) {
  console.error("❌ PATIENTS_SUPABASE_URL / PATIENTS_SUPABASE_SERVICE_KEY manquants dans .env.local");
  process.exit(1);
}

const SCRATCH =
  "/private/tmp/claude-501/-Users-maxwilliamrafaliarison-Library-CloudStorage-OneDrive-Personnel-Documents-Centre-REX/48e62b6c-f6f0-486f-94aa-f95a906e8f84/scratchpad";
const DB = `${SCRATCH}/um-proto.sqlite`;
const COLMAP = JSON.parse(readFileSync(`${SCRATCH}/patients-colmap.json`, "utf8"));

const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
const BATCH = 500;

// Lecture du sqlite via l'outil système (pas de dépendance npm)
function sqliteJson(query) {
  const out = execFileSync("sqlite3", ["-json", DB, query], {
    maxBuffer: 1024 * 1024 * 512,
  });
  const s = out.toString().trim();
  return s ? JSON.parse(s) : [];
}

const total = Math.min(
  sqliteJson('SELECT COUNT(*) AS n FROM "UM Proto"')[0].n,
  LIMIT,
);
console.log(`Import de ${total} dossiers vers ${URL_BASE} (lots de ${BATCH})${dryRun ? " [DRY RUN]" : ""}`);

async function postBatch(rows, attempt = 1) {
  const res = await fetch(`${URL_BASE}/rest/v1/dossiers`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": "patients",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    if (attempt < 4 && (res.status >= 500 || res.status === 429)) {
      await new Promise((r) => setTimeout(r, attempt * 3000));
      return postBatch(rows, attempt + 1);
    }
    throw new Error(`HTTP ${res.status} : ${text}`);
  }
}

let done = 0;
const start = Date.now();
for (let offset = 0; offset < total; offset += BATCH) {
  const raw = sqliteJson(
    `SELECT rowid AS __rowid, * FROM "UM Proto" LIMIT ${Math.min(BATCH, total - offset)} OFFSET ${offset}`,
  );
  const rows = raw.map((r) => {
    const out = { fmp_row: r.__rowid };
    for (const [fmpName, pgName] of Object.entries(COLMAP)) {
      const v = r[fmpName];
      out[pgName] = v === null || v === undefined || v === "" ? null : String(v);
    }
    return out;
  });
  if (!dryRun) await postBatch(rows);
  done += rows.length;
  if (done % 5000 < BATCH || done >= total) {
    const pct = Math.round((done / total) * 100);
    const rate = Math.round(done / ((Date.now() - start) / 1000) || 1);
    console.log(`  ${done}/${total} (${pct}%) · ${rate} lignes/s`);
  }
}

console.log(`\n✅ ${done} dossiers importés en ${Math.round((Date.now() - start) / 1000)}s.`);
if (dryRun) console.log("   (dry-run : rien n'a été envoyé)");
