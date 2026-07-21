#!/usr/bin/env node
/**
 * Copie Logistique : Google Sheets → Supabase (schéma logistique).
 *
 * Ne bascule RIEN : il ne fait que recopier. L'application continue de lire
 * Google Sheets tant que LOGISTIQUE_SUPABASE_TABS n'est pas posé.
 *
 * ⚠️ L'onglet `users` porte l'authentification de TOUTES les apps. Le script
 *    refuse de démarrer sur un doublon d'id ou d'email : mieux vaut ne rien
 *    copier que copier une ambiguïté sur des comptes.
 *
 * Prérequis :
 *   1. Migration 006_logistique.sql exécutée
 *   2. Schéma `logistique` exposé dans Data API → Settings
 *   3. .env.local : GOOGLE_SHEET_ID + credentials Google + SUPABASE_URL/KEY
 *
 * Usage :
 *   node scripts/migrate-logistique-to-supabase.mjs                  # simulation
 *   node scripts/migrate-logistique-to-supabase.mjs --apply
 *   node scripts/migrate-logistique-to-supabase.mjs --apply --truncate
 *   node scripts/migrate-logistique-to-supabase.mjs --tab=sites --apply
 */

import crypto from "node:crypto";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const TRUNCATE = args.includes("--truncate");
const TAB_ARG = args.find((a) => a.startsWith("--tab="))?.split("=")[1];

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
const SB_URL = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "")
  .trim()
  .replace(/\/+$/, "");
const SB_KEY = (
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.PATIENTS_SUPABASE_SERVICE_KEY ||
  ""
).replace(/[^A-Za-z0-9._-]/g, "");

if (!SHEET_ID || !SA_EMAIL || !SA_KEY || !SB_URL || !SB_KEY) {
  console.error("❌ Config incomplète (.env.local) : GOOGLE_SHEET_ID, credentials Google, SUPABASE_URL/KEY");
  process.exit(1);
}

/* ── Description des onglets ───────────────────────────────────────────────
   Doit rester aligné sur src/lib/sheets/columns.ts. `pk` sert à détecter
   les doublons ; `bools` et `nums` disent comment convertir les cellules.
*/
const TABS = {
  // Ordre volontaire : le référentiel d'abord, `users` en DERNIER — c'est
  // lui qui porte l'authentification, on ne le touche qu'une fois le reste
  // passé sans encombre.
  // boolVide : que vaut une cellule booléenne VIDE. Pour sites.active, le
  // lecteur de l'app considère vide = actif (sites.ts : `?? "TRUE"`) — la
  // copie doit préserver ce sens, pas le défaut technique false.
  sites: { pk: "id", bools: { active: false }, nums: [], boolVide: { active: true } },
  rooms: { pk: "id", bools: {}, nums: [] },
  materials: {
    pk: "id",
    bools: { internetAccess: true, linkedToBDD: true },
    nums: ["purchasePrice", "quantity2023", "quantity2024", "quantity2025"],
  },
  sessions: { pk: "id", bools: { isAdmin: false }, nums: [] },
  movements: { pk: "id", bools: {}, nums: [] },
  audit_log: { pk: "id", bools: {}, nums: [] },
  config: { pk: "key", bools: {}, nums: [] },
  trash: { pk: "id", bools: {}, nums: [] },
  network: { pk: "id", bools: {}, nums: [] },
  // users.active vide = REFUS de copier : deviner si un compte est actif
  // serait décider silencieusement qui peut se connecter (le schéma SQL le
  // déclare d'ailleurs not null SANS default, exprès pour échouer fort).
  users: { pk: "id", bools: { active: false }, nums: [], boolVide: { active: "refus" } },
};

// --- Google : JWT signé à la main + fetch (motif éprouvé sur la pharmacie)
const b64url = (i) =>
  Buffer.from(i).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

function googleJWT() {
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({
      iss: SA_EMAIL,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )}`;
  const sig = crypto
    .createSign("RSA-SHA256")
    .update(data)
    .sign(SA_KEY)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${data}.${sig}`;
}

async function fetchRetry(url, opts = {}, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timer);
      return res;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

const tok = await (
  await fetchRetry("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: googleJWT(),
    }),
  })
).json();
if (!tok.access_token) {
  console.error("❌ jeton Google :", JSON.stringify(tok).slice(0, 150));
  process.exit(1);
}

async function lireOnglet(tab) {
  // MÊMES options de lecture que l'application (src/lib/sheets/client.ts) :
  // sans elles, l'API renvoie les valeurs FORMATÉES (chaînes d'affichage,
  // locale du classeur) — les nombres deviendraient des chaînes que
  // Number() ne parse pas, convertirait en null, et Supabase servirait
  // des valeurs différentes de celles que l'app lit aujourd'hui.
  const res = await fetchRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tab)}!A1:ZZ?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    { headers: { Authorization: `Bearer ${tok.access_token}` } },
  );
  if (!res.ok) throw new Error(`lecture ${tab} : HTTP ${res.status}`);
  const rows = (await res.json()).values ?? [];
  if (rows.length === 0) return { entetes: [], lignes: [] };
  const [entetes, ...data] = rows;
  const lignes = data
    .filter((r) => r.some((c) => c !== null && c !== undefined && c !== ""))
    .map((r) => {
      const o = {};
      // L'API TRONQUE les cellules vides en fin de ligne : on comble depuis
      // les en-têtes, sinon les dernières colonnes seraient absentes de
      // l'objet et Postgres appliquerait ses défauts au lieu des vraies
      // valeurs vides.
      entetes.forEach((h, i) => {
        o[h] = r[i] ?? "";
      });
      return o;
    });
  return { entetes, lignes };
}

/** Convertit une ligne Sheets vers ce qu'attend Postgres. */
function convertir(tab, row) {
  const { bools, nums } = TABS[tab];
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k in bools) {
      const nullable = bools[k];
      if (v === "" || v === null || v === undefined) {
        const defautVide = TABS[tab].boolVide?.[k];
        if (defautVide === "refus") {
          throw new Error(
            `${tab}.${k} vide (${TABS[tab].pk}=${row[TABS[tab].pk]}) : refus de deviner — corriger la cellule avant de copier`,
          );
        }
        out[k] = defautVide ?? (nullable ? null : false);
      } else if (typeof v === "boolean") {
        out[k] = v;
      } else {
        const s = String(v).toUpperCase();
        out[k] = s === "TRUE" || s === "OUI" || s === "YES" || s === "1"
          ? true
          : s === "FALSE" || s === "NON" || s === "NO" || s === "0"
            ? false
            : nullable
              ? null
              : false;
      }
    } else if (nums.includes(k)) {
      if (v === "" || v === null || v === undefined) out[k] = null;
      else {
        const n = Number(v);
        // Une valeur imparsable copiée en null serait une PERTE silencieuse
        // (la leçon des 18 produits pharmacie) : on refuse et on la montre.
        if (!Number.isFinite(n)) {
          throw new Error(
            `${tab}.${k} = ${JSON.stringify(v)} (${TABS[tab].pk}=${row[TABS[tab].pk]}) : pas un nombre — copie refusée plutôt que null silencieux`,
          );
        }
        out[k] = n;
      }
    } else {
      // Texte : le vide s'écrit "" et jamais null (colonnes NOT NULL).
      out[k] = v === null || v === undefined ? "" : String(v);
    }
  }
  return out;
}

const SBH = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Profile": "logistique",
  "Content-Type": "application/json",
};

console.log(`Copie Logistique Sheets → Supabase${APPLY ? "" : "  [SIMULATION]"}${TRUNCATE ? "  [TRUNCATE]" : ""}\n`);

const aFaire = TAB_ARG ? [TAB_ARG] : Object.keys(TABS);
if (TAB_ARG && !TABS[TAB_ARG]) {
  console.error(`❌ onglet inconnu : ${TAB_ARG}. Choix : ${Object.keys(TABS).join(", ")}`);
  process.exit(1);
}

// --- Contrôle préalable : aucune ambiguïté ne doit être copiée -----------
const cache = {};
let bloquant = false;
for (const tab of aFaire) {
  const { lignes } = await lireOnglet(tab);
  cache[tab] = lignes;
  const pk = TABS[tab].pk;

  const vus = new Map();
  for (const l of lignes) vus.set(String(l[pk] ?? ""), (vus.get(String(l[pk] ?? "")) ?? 0) + 1);
  const doublons = [...vus.entries()].filter(([k, n]) => k && n > 1);
  const vides = lignes.filter((l) => !String(l[pk] ?? "").trim()).length;

  let souci = "";
  if (doublons.length) souci += `  ❌ ${doublons.length} doublon(s) de ${pk} : ${doublons.map(([k]) => k).join(", ")}`;
  if (vides) souci += `  ❌ ${vides} ligne(s) sans ${pk}`;

  // L'email est la clé de connexion : un doublon rendrait le login imprévisible.
  if (tab === "users") {
    const mails = new Map();
    for (const l of lignes) {
      const m = String(l.email ?? "").toLowerCase();
      mails.set(m, (mails.get(m) ?? 0) + 1);
    }
    const dbl = [...mails.entries()].filter(([m, n]) => m && n > 1);
    if (dbl.length) souci += `  ❌ email(s) en double : ${dbl.map(([m]) => m).join(", ")}`;
  }

  console.log(`${tab.padEnd(11)} : ${String(lignes.length).padStart(4)} ligne(s)${souci}`);
  if (souci) bloquant = true;
}

if (bloquant) {
  console.error("\n❌ ARRÊT : des identifiants sont ambigus. Rien n'a été écrit.");
  console.error("   Corrigez le Google Sheet puis relancez — copier une ambiguïté sur");
  console.error("   des comptes vaut moins que ne rien copier du tout.");
  process.exit(1);
}

if (!APPLY) {
  console.log("\n(simulation — relancez avec --apply pour écrire)");
  process.exit(0);
}

// --- Écriture -------------------------------------------------------------
console.log();
let total = 0;
for (const tab of aFaire) {
  const lignes = cache[tab].map((l) => convertir(tab, l));
  if (TRUNCATE) {
    const pk = TABS[tab].pk;
    const r = await fetchRetry(`${SB_URL}/rest/v1/${tab}?${pk}=neq.__aucun__`, {
      method: "DELETE",
      headers: { ...SBH, Prefer: "return=minimal" },
    });
    if (!r.ok && r.status !== 404) console.log(`  ⚠ purge ${tab} : HTTP ${r.status}`);
  }
  for (let i = 0; i < lignes.length; i += 500) {
    const lot = lignes.slice(i, i + 500);
    const r = await fetchRetry(`${SB_URL}/rest/v1/${tab}`, {
      method: "POST",
      headers: { ...SBH, Prefer: "return=minimal" },
      body: JSON.stringify(lot),
    });
    if (!r.ok) {
      console.error(`❌ ${tab} : HTTP ${r.status} — ${(await r.text()).slice(0, 220)}`);
      process.exit(1);
    }
  }
  console.log(`  ${tab.padEnd(11)} : ${lignes.length} ligne(s) copiée(s)`);
  total += lignes.length;
}
console.log(`\n✅ ${total} ligne(s) copiées. L'application lit TOUJOURS Google Sheets.`);
console.log("   Vérifiez la parité (/api/parity/logistique?tab=…) avant toute bascule.");
