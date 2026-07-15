#!/usr/bin/env node
/**
 * Ajoute les en-têtes du fractionnement dans le Google Sheet Pharmacie.
 *
 * POURQUOI : Supabase est le backend actif, mais le Sheet reste le filet de
 * secours (PHARMACIE_BACKEND=sheets suffit à y revenir). Les deux backends
 * doivent donc porter les mêmes colonnes, sinon un retour arrière perdrait
 * les données de fractionnement en silence : readTabSheets construit ses
 * objets à partir de la ligne d'en-têtes, et une colonne sans en-tête est
 * simplement ignorée à la lecture.
 *
 * ⚠ AJOUT EN FIN DE LIGNE UNIQUEMENT. updateProduitFieldsSheets mappe les
 *   colonnes par lettre en dur (prix_achat: "I", prix_vente: "J"…) : insérer
 *   une colonne avant la fin ferait écrire dans les mauvaises cellules sans
 *   la moindre erreur.
 *
 * Idempotent : n'écrit que si l'en-tête est absent.
 *
 * Usage : node scripts/ajouter-colonnes-fractionnement-sheet.mjs [--apply]
 */

import crypto from "node:crypto";

const APPLY = process.argv.includes("--apply");

const SHEET_ID = process.env.PHARMACIE_SHEET_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

if (!SHEET_ID || !SA_EMAIL || !SA_KEY) {
  console.error("❌ PHARMACIE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY manquants");
  process.exit(1);
}

/** Colonnes à ajouter, en fin de ligne d'en-têtes. */
const AJOUTS = {
  produits: [
    { col: "Q", nom: "facteur_conversion" },
    { col: "R", nom: "unite_detail" },
    { col: "S", nom: "prix_vente_detail" },
  ],
  mouvements: [
    { col: "K", nom: "unite_saisie" },
    { col: "L", nom: "facteur_applique" },
  ],
  lignes_vente: [
    { col: "H", nom: "mode_vente" },
    { col: "I", nom: "qte_stock_deduire" },
  ],
};

// --- Authentification Google (JWT manuel + fetch : le SDK googleapis a
//     un historique de blocages sur ce poste) -----------------------------
const b64url = (i) =>
  Buffer.from(i).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

function googleJWT(scope) {
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({
      iss: SA_EMAIL,
      scope,
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

async function fetchRetry(url, opts = {}, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timer);
      return res;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

const tok = await (
  await fetchRetry("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: googleJWT("https://www.googleapis.com/auth/spreadsheets"),
    }),
  })
).json();

if (!tok.access_token) {
  console.error("❌ jeton Google :", JSON.stringify(tok).slice(0, 150));
  process.exit(1);
}
const AUTH = { Authorization: `Bearer ${tok.access_token}` };

// --- Lecture des en-têtes actuels ----------------------------------------
console.log(`Colonnes fractionnement → Google Sheet${APPLY ? "" : "  [SIMULATION]"}\n`);

const aEcrire = [];
for (const [onglet, colonnes] of Object.entries(AJOUTS)) {
  const res = await fetchRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(onglet)}!A1:ZZ1`,
    { headers: AUTH },
  );
  if (!res.ok) {
    console.error(`❌ lecture ${onglet} : HTTP ${res.status}`);
    process.exit(1);
  }
  const entetes = (await res.json()).values?.[0] ?? [];
  console.log(`${onglet.padEnd(14)} : ${entetes.length} colonnes — ${entetes.join(", ")}`);

  for (const { col, nom } of colonnes) {
    if (entetes.includes(nom)) {
      console.log(`   ✓ ${nom} déjà présent`);
      continue;
    }
    // Garde-fou : la colonne visée doit être libre, sinon on écraserait
    // un en-tête existant (donc une colonne de données).
    const idx = col.charCodeAt(0) - 65;
    if (entetes[idx]) {
      console.error(`   ❌ ${onglet}!${col}1 est déjà occupé par "${entetes[idx]}" — ARRÊT`);
      process.exit(1);
    }
    console.log(`   + ${onglet}!${col}1 = "${nom}"`);
    aEcrire.push({ range: `${onglet}!${col}1`, values: [[nom]] });
  }
  console.log();
}

if (aEcrire.length === 0) {
  console.log("✅ Rien à faire, toutes les colonnes sont déjà là.");
  process.exit(0);
}

if (!APPLY) {
  console.log(`(simulation — ${aEcrire.length} en-tête(s) à écrire, relancez avec --apply)`);
  process.exit(0);
}

const up = await fetchRetry(
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`,
  {
    method: "POST",
    headers: { ...AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "RAW", data: aEcrire }),
  },
);

if (!up.ok) {
  console.error(`❌ écriture : HTTP ${up.status} — ${(await up.text()).slice(0, 200)}`);
  process.exit(1);
}
console.log(`✅ ${aEcrire.length} en-tête(s) ajouté(s) au Google Sheet.`);
