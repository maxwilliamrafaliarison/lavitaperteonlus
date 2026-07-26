#!/usr/bin/env node
/**
 * Importe les PRÉPARATIONS DU LABORATOIRE GALÉNIQUE (préparations officinales
 * fabriquées en interne) depuis « NOUVEL TARIF… LABORATOIRE GALENIQUE.xlsx ».
 *
 * Chaque préparation devient un produit ordinaire (vente + stock identiques)
 * MARQUÉ origine='galenique' → pastille dans l'app + rapport dédié. Id LG-xxx.
 * facteur 1 (chaque unité du tarif = l'unité vendable), prix_achat 0 (le coût
 * matières n'est pas dans le tarif), statut actif, stock 0 (à alimenter par le
 * registre des entrées ou un inventaire).
 *
 * ⚠️ Prérequis : migration 012 (colonne produits.origine) exécutée.
 * Idempotent : ne recrée pas une préparation déjà présente (par désignation).
 *
 * Usage :
 *   node --env-file=.env.local scripts/import-galenique.mjs           # simulation
 *   node --env-file=.env.local scripts/import-galenique.mjs --apply
 */
import { createRequire } from "node:module";
const XLSX = createRequire(process.cwd() + "/")("xlsx");

const APPLY = process.argv.includes("--apply");
const FICHIER = "/Users/maxwilliamrafaliarison/Library/CloudStorage/OneDrive-Personnel/Documents/Centre REX/dossier sans titre/NOUVEL TARIF POUR LES PRODUITS DU LABORATOIRE GALENIQUE.xlsx";

const URL_SB = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
if (!URL_SB || !KEY) { console.error("❌ env Supabase manquant"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Accept-Profile": "pharmacie", "Content-Profile": "pharmacie" };
async function pg(method, path, body) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

// Forme galénique + unité selon la catégorie du tarif.
function formeDe(cat) {
  const C = cat.toUpperCase();
  if (C.includes("CREME") || C.includes("SEMI-SOLIDE")) return { forme: "CRÈME / GEL", unite: "" };
  if (C.includes("APPLICATION CUTANEE")) return { forme: "SOLUTION CUTANÉE", unite: "" };
  if (C.includes("SUPPOSITOIRE")) return { forme: "SUPPOSITOIRE", unite: "suppositoire" };
  if (C.includes("OVULE")) return { forme: "OVULE", unite: "ovule" };
  if (C.includes("SUSPENSION")) return { forme: "SUSPENSION BUVABLE", unite: "" };
  if (C.includes("SIROP")) return { forme: "SIROP", unite: "" };
  if (C.includes("CAPSULE")) return { forme: "CAPSULE", unite: "capsule" };
  return { forme: "PRÉPARATION", unite: "" };
}
const condLisible = (c) => ({ U: "unité", CPS: "capsule" }[c.toUpperCase()] || c);
const N = (s) => Number(String(s ?? "").replace(/[,\s]/g, "")) || 0;

// Lecture du tarif → préparations.
const rows = XLSX.utils.sheet_to_json(XLSX.readFile(FICHIER).Sheets["Feuil1"], { header: 1, raw: false });
const preps = [];
let cat = null;
for (const r of rows) {
  if (!r) continue;
  const a = String(r[0] ?? "").trim(), b = String(r[1] ?? "").trim(), c = String(r[2] ?? "").trim();
  if (a && !b && (c === "" || /PRIX/i.test(c))) {
    if (!/TARIFS DES PRODUITS/i.test(a)) cat = a;
    continue;
  }
  if (a && b && cat) {
    const { forme, unite } = formeDe(cat);
    preps.push({ designation: a.toUpperCase(), conditionnement: condLisible(b), prixVente: N(c), forme, unite });
  }
}
console.log(`${preps.length} préparations lues dans le tarif galénique.`);

// Idempotence : quelles désignations existent déjà (galéniques) ?
const existants = await pg("GET", "produits?origine=eq.galenique&select=designation").catch((e) => {
  if (String(e).includes("origine")) { console.error("❌ Colonne 'origine' absente — exécuter d'abord la migration 012."); process.exit(1); }
  throw e;
});
const dejaLa = new Set(existants.map((p) => p.designation));

// Prochain numéro LG.
const lg = await pg("GET", "produits?id=like.LG-*&select=id");
let seq = lg.reduce((m, p) => Math.max(m, Number(String(p.id).replace("LG-", "")) || 0), 0);

const aCreer = preps.filter((p) => !dejaLa.has(p.designation));
console.log(`${aCreer.length} à créer · ${preps.length - aCreer.length} déjà présentes.`);
console.log("\nAperçu :");
for (const p of aCreer) console.log(`  ${p.forme.padEnd(18)} | ${p.designation.padEnd(34).slice(0, 34)} | ${p.conditionnement.padEnd(8)} | ${p.prixVente} Ar${p.unite ? " · /" + p.unite : ""}`);

if (!APPLY) { console.log("\n(simulation — relancez avec --apply)"); process.exit(0); }

for (const p of aCreer) {
  const id = `LG-${String(++seq).padStart(3, "0")}`;
  await pg("POST", "produits", {
    id, code: id, designation: p.designation, dci: "", classe: "PRÉPARATION GALÉNIQUE",
    forme: p.forme, dosage: "", conditionnement: p.conditionnement,
    prix_achat: 0, prix_vente: p.prixVente, prix_unitaire: p.prixVente, prix_vente_detail: 0,
    stock_min: 0, fournisseur: "Laboratoire galénique", emplacement: "LABO GALENIQUE",
    statut: "actif", createdAt: new Date().toISOString(),
    facteur_conversion: 1, unite_detail: p.unite, origine: "galenique",
  });
  console.log(`✅ ${id} ${p.designation}`);
}

const total = await pg("GET", "produits?origine=eq.galenique&select=id");
console.log(`\n✅ ${aCreer.length} préparations créées · ${total.length} produits galéniques au total.`);
