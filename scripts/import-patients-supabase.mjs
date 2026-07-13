#!/usr/bin/env node
/**
 * Importe les données FileMaker (extraction fmp2sqlite) vers Supabase,
 * schema patients, par lots de 500 via PostgREST (clé service_role).
 *
 * Sources (snapshot du 11-07-2026, dossier « Archive BDD juillet 2026 ») :
 *   - dossiers : um-proto-juillet.sqlite  → patients.dossiers   (139 928)
 *   - caisse   : caisse-juillet.sqlite    → patients.caisse     (44 144)
 *   - lettres  : lettres-juillet.sqlite   → patients.lettres    (45 466)
 *
 * FileMaker reste le système d'écriture jusqu'à la bascule : ré-exécuter
 * l'import après un TRUNCATE des tables (SQL Editor) pour rafraîchir.
 *
 * Prérequis :
 *   1. Migrations 001 + 002 exécutées dans le SQL Editor
 *   2. Settings → API → Exposed schemas : ajouter `patients`
 *   3. .env.local : PATIENTS_SUPABASE_URL + PATIENTS_SUPABASE_SERVICE_KEY
 *
 * Usage :
 *   node scripts/import-patients-supabase.mjs [dossiers|caisse|lettres|tout]
 *        [--dry-run] [--limit N]
 */

import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });

const URL_BASE = process.env.PATIENTS_SUPABASE_URL;
const KEY = process.env.PATIENTS_SUPABASE_SERVICE_KEY;
if (!URL_BASE || !KEY) {
  console.error(
    "❌ PATIENTS_SUPABASE_URL / PATIENTS_SUPABASE_SERVICE_KEY manquants dans .env.local",
  );
  process.exit(1);
}

const SCRATCH =
  "/private/tmp/claude-501/-Users-maxwilliamrafaliarison-Library-CloudStorage-OneDrive-Personnel-Documents-Centre-REX/48e62b6c-f6f0-486f-94aa-f95a906e8f84/scratchpad";

const SOURCES = {
  dossiers: {
    db: `${SCRATCH}/um-proto-juillet.sqlite`,
    table: "UM Proto",
    colmap: `${SCRATCH}/patients-colmap.json`,
    target: "dossiers",
  },
  caisse: {
    db: `${SCRATCH}/caisse-juillet.sqlite`,
    table: "Caisse",
    colmap: `${SCRATCH}/patients-colmap-caisse.json`,
    target: "caisse",
  },
  lettres: {
    db: `${SCRATCH}/lettres-juillet.sqlite`,
    table: "Lettres",
    colmap: `${SCRATCH}/patients-colmap-lettres.json`,
    target: "lettres",
  },
};

const which = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "tout";
const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
const BATCH = 500;

const jobs = which === "tout" ? Object.keys(SOURCES) : [which];
if (jobs.some((j) => !SOURCES[j])) {
  console.error(`❌ Source inconnue « ${which} » (dossiers|caisse|lettres|tout)`);
  process.exit(1);
}

function sqliteJson(db, query) {
  const out = execFileSync("sqlite3", ["-json", db, query], {
    maxBuffer: 1024 * 1024 * 512,
  });
  const s = out.toString().trim();
  return s ? JSON.parse(s) : [];
}

async function postBatch(target, rows, attempt = 1) {
  const res = await fetch(`${URL_BASE}/rest/v1/${target}`, {
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
      return postBatch(target, rows, attempt + 1);
    }
    throw new Error(`HTTP ${res.status} : ${text}`);
  }
}

for (const job of jobs) {
  const src = SOURCES[job];
  const COLMAP = JSON.parse(readFileSync(src.colmap, "utf8"));
  const total = Math.min(
    sqliteJson(src.db, `SELECT COUNT(*) AS n FROM "${src.table}"`)[0].n,
    LIMIT,
  );
  console.log(
    `\n=== ${job} → patients.${src.target} : ${total} lignes${dryRun ? " [DRY RUN]" : ""} ===`,
  );

  let done = 0;
  const start = Date.now();
  for (let offset = 0; offset < total; offset += BATCH) {
    const raw = sqliteJson(
      src.db,
      `SELECT rowid AS __rowid, * FROM "${src.table}" LIMIT ${Math.min(BATCH, total - offset)} OFFSET ${offset}`,
    );
    const rows = raw.map((r) => {
      const out = { fmp_row: r.__rowid };
      for (const [fmpName, pgName] of Object.entries(COLMAP)) {
        const v = r[fmpName];
        out[pgName] = v === null || v === undefined || v === "" ? null : String(v);
      }
      return out;
    });
    if (!dryRun) await postBatch(src.target, rows);
    done += rows.length;
    if (done % 10000 < BATCH || done >= total) {
      const rate = Math.round(done / ((Date.now() - start) / 1000) || 1);
      console.log(`  ${done}/${total} (${Math.round((done / total) * 100)}%) · ${rate} lignes/s`);
    }
  }
  console.log(`✅ ${job} : ${done} lignes en ${Math.round((Date.now() - start) / 1000)}s`);
}

if (dryRun) console.log("\n(dry-run : rien n'a été envoyé)");
