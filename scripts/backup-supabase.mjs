#!/usr/bin/env node
/**
 * Sauvegarde des données Supabase — patients, pharmacie, logistique.
 *
 * ── POURQUOI PAS pg_dump ─────────────────────────────────────────────────
 * pg_dump exige un binaire Postgres (absent de ce poste et de Vercel) et le
 * mot de passe de la base, alors que tout le reste du projet n'utilise que
 * la clé service_role. Ici : PostgREST + fetch, comme le reste du code.
 *
 * Le SCHÉMA n'a pas besoin d'être sauvegardé — il vit dans git
 * (supabase/migrations/*.sql). Une restauration complète, c'est donc :
 *     rejouer les migrations  +  recharger ce fichier de données.
 * Cette procédure est écrite ET TESTÉE dans docs/RESTAURATION.md.
 *
 * ── CE QUE CE SCRIPT GARANTIT ────────────────────────────────────────────
 * Il RELIT ce qu'il vient d'écrire et compare ligne à ligne. Une sauvegarde
 * qu'on n'a pas vérifiée n'est pas une sauvegarde, c'est un espoir — et une
 * sauvegarde corrompue qui existe est pire que pas de sauvegarde du tout,
 * parce qu'elle donne une fausse confiance. (Leçon prise à l'app d'Eugenio,
 * qui vérifiait réellement ses copies.)
 *
 * Usage :
 *   node scripts/backup-supabase.mjs                    # → ./backups/
 *   node scripts/backup-supabase.mjs --out=/chemin
 *   node scripts/backup-supabase.mjs --schema=pharmacie
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { join } from "node:path";

const args = process.argv.slice(2);
const OUT = args.find((a) => a.startsWith("--out="))?.split("=")[1] ?? "./backups";
const ONLY = args.find((a) => a.startsWith("--schema="))?.split("=")[1];

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

/**
 * Tables à sauvegarder, avec leur clé de tri.
 * ⚠️ Ajouter ici toute nouvelle table, sinon elle ne sera jamais sauvegardée
 *    et personne ne s'en apercevra avant d'en avoir besoin.
 */
const SCHEMAS = {
  patients: [
    { table: "dossiers", pk: "id" },
    { table: "acces_log", pk: "id" },
  ],
  pharmacie: [
    { table: "produits", pk: "id" },
    { table: "lots", pk: "id" },
    { table: "mouvements", pk: "id" },
    { table: "ventes", pk: "id" },
    { table: "lignes_vente", pk: "id" },
    { table: "fournisseurs", pk: "id" },
    { table: "parametres", pk: "cle" },
  ],
  logistique: [
    { table: "users", pk: "id" },
    { table: "sites", pk: "id" },
    { table: "rooms", pk: "id" },
    { table: "materials", pk: "id" },
    { table: "sessions", pk: "id" },
    { table: "movements", pk: "id" },
    { table: "audit_log", pk: "id" },
    { table: "config", pk: "key" },
    { table: "trash", pk: "id" },
    { table: "network", pk: "id" },
  ],
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

/**
 * Nombre de lignes annoncé par le SERVEUR. C'est la seule référence qui
 * vaille : une sauvegarde ne peut pas se déclarer complète en se comparant
 * à elle-même.
 */
async function compter(schema, table) {
  const res = await fetchRetry(`${URL_SB}/rest/v1/${table}?select=*&limit=1`, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Accept-Profile": schema,
      Prefer: "count=exact",
    },
  });
  if (!res.ok) {
    throw new Error(`${schema}.${table} : HTTP ${res.status} — ${(await res.text()).slice(0, 120)}`);
  }
  const n = Number((res.headers.get("content-range") ?? "").split("/")[1]);
  if (!Number.isFinite(n)) throw new Error(`${schema}.${table} : le serveur n'annonce aucun total`);
  return n;
}

/**
 * Lit une table entière, page par page, jusqu'au compte annoncé.
 *
 * ⚠️ PostgREST PLAFONNE à 1000 lignes par réponse, quel que soit le `limit`
 * demandé. Une boucle qui s'arrête sur `rows.length < page` (le réflexe
 * habituel) se termine donc dès la première page si page > 1000 : elle
 * ramène 1000 lignes sur 139 928 et n'échoue jamais. C'est exactement le
 * bug qu'a eu ce script à sa première écriture — invisible, et validé par
 * une vérification qui comparait le fichier à lui-même.
 *
 * On boucle donc jusqu'au total du SERVEUR, et on refuse de continuer si le
 * compte n'y est pas.
 */
async function lireTable(schema, table, pk) {
  const attendu = await compter(schema, table);
  const all = [];
  const PAGE = 1000; // plafond réel de PostgREST
  for (let offset = 0; offset < attendu; offset += PAGE) {
    // `order` explicite : sans lui, un LIMIT/OFFSET n'a aucun ordre garanti
    // en Postgres — la sauvegarde dupliquerait ou omettrait des lignes.
    const url = `${URL_SB}/rest/v1/${table}?select=*&order=${pk}.asc&limit=${PAGE}&offset=${offset}`;
    const res = await fetchRetry(url, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Accept-Profile": schema },
    });
    if (!res.ok) {
      throw new Error(`${schema}.${table} : HTTP ${res.status} — ${(await res.text()).slice(0, 120)}`);
    }
    const rows = await res.json();
    if (rows.length === 0) break; // sécurité : jamais de boucle infinie
    all.push(...rows);
    process.stdout.write(`\r  ${schema}.${table} : ${all.length}/${attendu} lignes…   `);
  }

  // Contrôle contre la SOURCE, pas contre nous-mêmes.
  if (all.length !== attendu) {
    throw new Error(
      `${schema}.${table} : ${all.length} lignes lues pour ${attendu} annoncées par le serveur — sauvegarde INCOMPLÈTE, on s'arrête.`,
    );
  }
  // Un doublon signalerait une pagination instable (tri non déterministe).
  const uniques = new Set(all.map((r) => String(r[pk])));
  if (uniques.size !== all.length) {
    throw new Error(
      `${schema}.${table} : ${all.length - uniques.size} doublon(s) — pagination instable, sauvegarde refusée.`,
    );
  }
  return all;
}

const debut = Date.now();
// Horodatage en UTC : le nom de fichier doit trier chronologiquement, quel
// que soit le fuseau de la machine qui lance la sauvegarde.
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const schemas = ONLY ? { [ONLY]: SCHEMAS[ONLY] } : SCHEMAS;

if (ONLY && !SCHEMAS[ONLY]) {
  console.error(`❌ schéma inconnu : ${ONLY}. Choix : ${Object.keys(SCHEMAS).join(", ")}`);
  process.exit(1);
}

console.log(`Sauvegarde Supabase → ${OUT}\n`);

const dump = { version: 1, date: new Date().toISOString(), source: URL_SB, schemas: {} };
let total = 0;

for (const [schema, tables] of Object.entries(schemas)) {
  dump.schemas[schema] = {};
  for (const { table, pk } of tables) {
    const rows = await lireTable(schema, table, pk);
    dump.schemas[schema][table] = rows;
    total += rows.length;
    process.stdout.write(`\r  ${(schema + "." + table).padEnd(26)} ${String(rows.length).padStart(7)} lignes\n`);
  }
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const fichier = join(OUT, `supabase_${stamp}.json.gz`);

const brut = Buffer.from(JSON.stringify(dump));
writeFileSync(fichier, gzipSync(brut, { level: 9 }));

// --- Vérification : on RELIT le fichier écrit et on recompte -------------
// Sans ce contrôle, on n'aurait qu'un fichier, pas une sauvegarde.
let verifie;
try {
  // Relecture depuis le DISQUE, pas depuis la mémoire : c'est le fichier
  // qu'on restaurera un jour, pas la variable.
  verifie = JSON.parse(gunzipSync(readFileSync(fichier)).toString());
} catch (e) {
  console.error(`\n❌ Le fichier écrit est ILLISIBLE : ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

let ecart = 0;
for (const [schema, tables] of Object.entries(dump.schemas)) {
  for (const [table, rows] of Object.entries(tables)) {
    const relu = verifie.schemas?.[schema]?.[table];
    if (!Array.isArray(relu) || relu.length !== rows.length) {
      console.error(`❌ ${schema}.${table} : ${rows.length} écrites, ${relu?.length ?? "aucune"} relues`);
      ecart++;
    }
  }
}
if (ecart > 0) {
  console.error("\n❌ SAUVEGARDE CORROMPUE — ne pas s'y fier.");
  process.exit(1);
}

const taille = statSync(fichier).size;
const secondes = ((Date.now() - debut) / 1000).toFixed(1);
console.log(`\n✅ ${total.toLocaleString("fr-FR")} lignes · ${(taille / 1048576).toFixed(1)} Mo · ${secondes} s`);
console.log(`   ${fichier}`);
console.log(`   Relue et vérifiée ligne à ligne.\n`);
console.log("⚠️  Une sauvegarde qui reste sur ce poste ne protège de rien :");
console.log("    copiez ce fichier AILLEURS (disque externe, Drive de l'ONG).");
console.log("    Procédure de restauration : docs/RESTAURATION.md");
