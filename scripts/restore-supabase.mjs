#!/usr/bin/env node
/**
 * Restauration d'une sauvegarde produite par backup-supabase.mjs.
 *
 * Une restauration jamais exercée n'est pas une procédure, c'est une
 * croyance. Ce script existe pour être TESTÉ régulièrement, pas seulement
 * le jour où tout est perdu. Voir docs/RESTAURATION.md.
 *
 * ── SÉCURITÉ ─────────────────────────────────────────────────────────────
 * Écraser la production par erreur en croyant faire un test serait pire que
 * la panne d'origine. Trois barrières :
 *   1. simulation par défaut — il faut --apply pour écrire quoi que ce soit ;
 *   2. --schema OBLIGATOIRE : on ne restaure jamais tout d'un geste ;
 *   3. --purge (vider avant de recharger) exige en plus --confirm=NOM_DU_SCHEMA,
 *      tapé à la main.
 *
 * Le schéma lui-même n'est pas restauré par ce script : il vit dans git
 * (supabase/migrations/*.sql). Restauration complète = rejouer les
 * migrations, puis lancer ce script.
 *
 * Usage :
 *   node scripts/restore-supabase.mjs --file=backups/x.json.gz --schema=pharmacie
 *   node scripts/restore-supabase.mjs --file=… --schema=pharmacie --apply
 *   node scripts/restore-supabase.mjs --file=… --schema=pharmacie --apply --purge --confirm=pharmacie
 *   node scripts/restore-supabase.mjs --file=… --schema=pharmacie --apply --cible=restore_test
 */

import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const args = process.argv.slice(2);
const FILE = args.find((a) => a.startsWith("--file="))?.split("=")[1];
const SCHEMA = args.find((a) => a.startsWith("--schema="))?.split("=")[1];
const CIBLE = args.find((a) => a.startsWith("--cible="))?.split("=")[1] ?? SCHEMA;
const CONFIRM = args.find((a) => a.startsWith("--confirm="))?.split("=")[1];
const APPLY = args.includes("--apply");
const PURGE = args.includes("--purge");

const URL_SB = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "")
  .trim()
  .replace(/\/+$/, "");
const KEY = (
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.PATIENTS_SUPABASE_SERVICE_KEY ||
  ""
).replace(/[^A-Za-z0-9._-]/g, "");

if (!URL_SB || !KEY) {
  console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_KEY manquants (.env.local)");
  process.exit(1);
}
if (!FILE || !existsSync(FILE)) {
  console.error(`❌ --file= requis et lisible (reçu : ${FILE ?? "rien"})`);
  process.exit(1);
}
if (!SCHEMA) {
  console.error("❌ --schema= OBLIGATOIRE. On ne restaure jamais tous les schémas d'un seul geste.");
  process.exit(1);
}

/** Clé primaire par table — sert à purger et à compter. */
const PK = {
  dossiers: "id", acces_log: "id",
  produits: "id", lots: "id", mouvements: "id", ventes: "id",
  lignes_vente: "id", fournisseurs: "id", parametres: "cle",
  users: "id", sites: "id", rooms: "id", materials: "id",
  sessions: "id", movements: "id", audit_log: "id", config: "key",
  trash: "id", network: "id",
};

async function fetchRetry(url, opts = {}, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60000);
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timer);
      return res;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

const dump = JSON.parse(gunzipSync(readFileSync(FILE)).toString());
const tables = dump.schemas?.[SCHEMA];
if (!tables) {
  console.error(`❌ Le schéma "${SCHEMA}" n'est pas dans cette sauvegarde. Présents : ${Object.keys(dump.schemas ?? {}).join(", ")}`);
  process.exit(1);
}

console.log(`Restauration ${SCHEMA} → ${CIBLE}${APPLY ? "" : "  [SIMULATION]"}${PURGE ? "  [PURGE]" : ""}`);
console.log(`  sauvegarde du ${dump.date}`);
console.log(`  source        ${dump.source}\n`);

for (const [table, rows] of Object.entries(tables)) {
  console.log(`  ${table.padEnd(16)} ${String(rows.length).padStart(7)} ligne(s)`);
}

if (!APPLY) {
  console.log("\n(simulation — ajoutez --apply pour écrire)");
  process.exit(0);
}

if (PURGE && CONFIRM !== CIBLE) {
  console.error(`\n❌ --purge efface TOUT le schéma "${CIBLE}" avant de recharger.`);
  console.error(`   Pour confirmer, ajoutez : --confirm=${CIBLE}`);
  process.exit(1);
}

const H = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Profile": CIBLE,
  "Content-Type": "application/json",
};

console.log();
let total = 0;
// Ordre inverse à la purge : on vide les tables filles avant les mères, au
// cas où des clés étrangères seraient ajoutées un jour.
const noms = Object.keys(tables);
if (PURGE) {
  for (const table of [...noms].reverse()) {
    const pk = PK[table] ?? "id";
    const r = await fetchRetry(`${URL_SB}/rest/v1/${table}?${pk}=neq.__aucun__`, {
      method: "DELETE",
      headers: { ...H, Prefer: "return=minimal" },
    });
    if (!r.ok && r.status !== 404) console.log(`  ⚠ purge ${table} : HTTP ${r.status}`);
  }
}

for (const [table, rows] of Object.entries(tables)) {
  if (rows.length === 0) continue;
  for (let i = 0; i < rows.length; i += 500) {
    const lot = rows.slice(i, i + 500);
    const r = await fetchRetry(`${URL_SB}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify(lot),
    });
    if (!r.ok) {
      console.error(`\n❌ ${table} : HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`);
      console.error("   Restauration INTERROMPUE. Les tables déjà chargées le restent.");
      process.exit(1);
    }
    process.stdout.write(`\r  ${table} : ${Math.min(i + 500, rows.length)}/${rows.length}…   `);
  }
  process.stdout.write(`\r  ${table.padEnd(16)} ${String(rows.length).padStart(7)} ligne(s) restaurée(s)\n`);
  total += rows.length;
}

// Contrôle : ce qu'annonce la base, comparé à ce que contenait le fichier.
console.log("\nContrôle :");
let ecart = 0;
for (const [table, rows] of Object.entries(tables)) {
  const r = await fetchRetry(`${URL_SB}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Accept-Profile": CIBLE, Prefer: "count=exact" },
  });
  const n = Number((r.headers.get("content-range") ?? "").split("/")[1]);
  const ok = n === rows.length;
  if (!ok) ecart++;
  console.log(`  ${ok ? "✅" : "❌"} ${table.padEnd(16)} base:${String(n).padStart(7)}  sauvegarde:${String(rows.length).padStart(7)}`);
}

console.log(
  ecart === 0
    ? `\n✅ ${total.toLocaleString("fr-FR")} ligne(s) restaurées et vérifiées contre la base.`
    : `\n❌ ${ecart} table(s) en écart — restauration NON conforme.`,
);
process.exit(ecart === 0 ? 0 : 1);
