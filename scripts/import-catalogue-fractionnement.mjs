#!/usr/bin/env node
/**
 * Active le FRACTIONNEMENT depuis le CATALOGUE PHARMACIE REX.xlsx.
 *
 * Le catalogue donne, par produit : PRIX_VENTE (boîte) et PRIX UNITAIRE.
 *   facteur = PRIX_VENTE / PRIX_UNITAIRE (prix unitaire PRÉCIS de l'onglet
 *   IMPR pour un entier exact). facteur = 1 ⇒ vendu à la boîte uniquement.
 *
 * Deux volets INDISSOCIABLES :
 *  1. Métadonnées : facteur_conversion, unite_detail, prix_vente_detail.
 *  2. CONVERSION DU STOCK : le stock existant est en BOÎTES (facteur était 1).
 *     Pour chaque (produit, lot, compartiment) fractionné, on ajoute UN
 *     mouvement 'ajustement' = q×(facteur−1) → le total devient q×facteur
 *     unités de base, à l'identique physiquement. Sans ça, l'app lirait le
 *     stock en unités et l'effondrerait.
 *
 * Idempotent : mouvements de conversion à id déterministe MVT-CONV-* (sautés
 * s'ils existent) ; PATCH métadonnées rejouable.
 *
 * Usage :
 *   node --env-file=.env.local scripts/import-catalogue-fractionnement.mjs         # dry-run (table complète)
 *   node --env-file=.env.local scripts/import-catalogue-fractionnement.mjs --apply
 */
import { createRequire } from "node:module";
const XLSX = createRequire(process.cwd() + "/")("xlsx");

const APPLY = process.argv.includes("--apply");
const FICHIER = "/Users/maxwilliamrafaliarison/Library/CloudStorage/OneDrive-Personnel/Documents/Centre REX/CATALOGUE PHARMACIE REX.xlsx";

const URL_SB = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
if (!URL_SB || !KEY) { console.error("❌ env Supabase manquant"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Accept-Profile": "pharmacie", "Content-Profile": "pharmacie" };
async function pg(method, path, body) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

// ── Catalogue ──────────────────────────────────────────────────────────────
const N = (s) => Number(String(s ?? "").replace(/[,\s]/g, "").replace("MGA", "")) || 0;
const clean = (s) => String(s ?? "").trim();
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const wb = XLSX.readFile(FICHIER);
const imprRows = XLSX.utils.sheet_to_json(wb.Sheets["IMPR"], { header: 1, raw: false });
const unitPrecis = new Map();
for (const r of imprRows.slice(2)) { if (r && clean(r[0])) unitPrecis.set(norm(r[0]) + "|" + norm(r[3]), N(r[5])); }
const cat = [];
for (const r of XLSX.utils.sheet_to_json(wb.Sheets["Feuil2"], { header: 1, raw: false }).slice(2)) {
  if (!r || !clean(r[0])) continue;
  const desig = clean(r[0]), forme = clean(r[3]);
  cat.push({ desig, forme, dosage: clean(r[4]), prixVente: N(r[6]), prixUnitAff: N(r[7]), prixUnitPrecis: unitPrecis.get(norm(desig) + "|" + norm(forme)) || N(r[7]) });
}

const uniteForme = (f, desig) => {
  const F = (f || "").toUpperCase(), D = (desig || "").toUpperCase();
  if (F.includes("COMPRIME")) return "comprimé";
  if (F.includes("GELLULE") || F.includes("GELULE") || F.includes("GÉLULE")) return "gélule";
  if (F.includes("SACHET")) return "sachet";
  if (F.includes("SUPPO")) return "suppositoire";
  if (F.includes("CAPSULE")) return "capsule";
  if (F.includes("INJECTABLE") || F.includes("AMPOULE")) return "ampoule";
  if (D.includes("SERINGUE")) return "seringue";
  if (D.includes("SPARADRAP") || D.includes("COMPRESSE") || D.includes("FIL")) return "pièce";
  return "";
};

// Produits app créés hors catalogue (juillet) : facteur connu du conditionnement.
const OVERRIDE = {
  "PHA-066": { facteur: 21, unite: "comprimé" },  // RAPICLAV 625, B/21
  "PHA-067": { facteur: 100, unite: "comprimé" }, // CIPROFLOXACINE PHARMATEK, B/100
};
// Désignation app → désignation catalogue quand la graphie diffère.
const ALIAS_DESIG = { "compresse steryl": "COMPRESSE STERILE 40X40" };

// ── Produits app + stock par (lot, compartiment) ────────────────────────────
const prods = await pg("GET", "produits?select=id,designation,forme,dosage,prix_vente,facteur_conversion,statut&limit=1000");
const mvts = await pg("GET", "mouvements?select=produit_id,lot_id,quantite,compartiment&limit=20000");
const buckets = new Map(); // produit_id → Map(lot|comp → qty)
for (const m of mvts) {
  const b = buckets.get(m.produit_id) ?? new Map();
  const k = `${m.lot_id ?? ""}|${m.compartiment ?? "gros"}`;
  b.set(k, (b.get(k) ?? 0) + Number(m.quantite));
  buckets.set(m.produit_id, b);
}

function catalogueDe(p) {
  const aliasCible = ALIAS_DESIG[norm(p.designation)];
  const np = aliasCible ? norm(aliasCible) : norm(p.designation);
  let cand = cat.filter((c) => norm(c.desig) === np);
  if (cand.length > 1) { const f = cand.filter((c) => norm(c.forme) === norm(p.forme)); if (f.length) cand = f; }
  if (cand.length > 1) { const d = cand.filter((c) => norm(c.dosage) === norm(p.dosage)); if (d.length) cand = d; }
  if (!cand.length) cand = cat.filter((c) => norm(c.desig).startsWith(np) || np.startsWith(norm(c.desig)));
  if (cand.length > 1) { const f = cand.filter((c) => norm(c.forme) === norm(p.forme)); if (f.length) cand = f; }
  return cand[0] ?? null;
}

// ── Construire le plan par produit ──────────────────────────────────────────
const plan = [];
for (const p of prods) {
  const ov = OVERRIDE[p.id];
  const c = catalogueDe(p);
  let facteur, unite, prixDetail, source;
  if (ov) { facteur = ov.facteur; unite = ov.unite; prixDetail = Math.round(p.prix_vente / facteur); source = "override"; }
  else if (c) {
    const ratio = c.prixUnitPrecis > 0 ? c.prixVente / c.prixUnitPrecis : 1;
    facteur = Math.round(ratio);
    unite = facteur > 1 ? uniteForme(c.forme, c.desig) : "";
    prixDetail = facteur > 1 ? Math.round(c.prixUnitAff) : 0;
    source = "catalogue";
  } else { facteur = 1; unite = ""; prixDetail = 0; source = "absent"; }
  const b = buckets.get(p.id) ?? new Map();
  const stockBoites = [...b.values()].reduce((s, q) => s + q, 0);
  plan.push({ p, facteur, unite, prixDetail, source, buckets: b, stockBoites });
}

// ── Dry-run : table complète ────────────────────────────────────────────────
const frac = plan.filter((x) => x.facteur > 1);
const box = plan.filter((x) => x.facteur === 1);
console.log("PRODUITS VENDUS À L'UNITÉ (facteur > 1) :");
console.log("  " + "PRODUIT".padEnd(24) + "FACT".padStart(5) + "  UNITÉ".padEnd(13) + " PRIX/U".padStart(8) + "   STOCK boîtes → unités");
for (const x of frac.sort((a, b) => b.facteur - a.facteur)) {
  const conv = `${x.stockBoites} → ${x.stockBoites * x.facteur}`;
  console.log(`  ${x.p.designation.padEnd(24).slice(0, 24)}${("×" + x.facteur).padStart(5)}  ${x.unite.padEnd(12)}${String(x.prixDetail).padStart(7)} Ar   ${conv}${x.source === "override" ? "  [hors-cat]" : ""}`);
}
console.log(`\nPRODUITS EN BOÎTE UNIQUEMENT (facteur 1) : ${box.length}`);
console.log("  " + box.map((x) => x.p.designation).sort().join(" · "));
console.log(`\nRésumé : ${frac.length} à l'unité · ${box.length} boîte seule · ${prods.length} produits`);
const dejaFrac = plan.filter((x) => x.p.facteur_conversion > 1);
if (dejaFrac.length) console.log("Déjà fractionnés (seront re-vérifiés):", dejaFrac.map((x) => x.p.id).join(", "));
// consommables du catalogue absents de l'app
const nonApp = cat.filter((c) => !plan.some((x) => x.source === "catalogue" && catalogueDe(x.p) === c) && !prods.some((p) => norm(p.designation) === norm(c.desig)));
if (nonApp.length) console.log("\nⓘ Dans le catalogue mais absents de l'app (non créés):", [...new Set(nonApp.map((c) => c.desig))].join(" · "));

if (!APPLY) { console.log("\n(dry-run — relancez avec --apply pour écrire)"); process.exit(0); }

// ── Apply ────────────────────────────────────────────────────────────────────
const ts = new Date().toISOString();
let nMeta = 0, nConv = 0;
for (const x of plan) {
  if (x.facteur <= 1) continue; // rien à faire pour les boîte-seule
  // 1. métadonnées
  await pg("PATCH", `produits?id=eq.${x.p.id}`, {
    facteur_conversion: x.facteur, unite_detail: x.unite, prix_vente_detail: x.prixDetail,
  });
  nMeta++;
  // 2. conversion du stock, bucket par bucket (préserve lots + compartiments)
  for (const [k, q] of x.buckets) {
    if (q === 0) continue;
    const [lot, comp] = k.split("|");
    const delta = q * (x.facteur - 1);
    if (delta === 0) continue;
    const id = `MVT-CONV-${x.p.id}-${lot || "NOLOT"}-${comp}`;
    const existe = await pg("GET", `mouvements?id=eq.${encodeURIComponent(id)}&select=id`);
    if (existe.length) continue;
    await pg("POST", "mouvements", {
      id, timestamp: ts, produit_id: x.p.id, lot_id: lot, type: "ajustement",
      quantite: delta, prix_unitaire: 0, reference: "conversion-facteur", user_email: "system",
      note: `Conversion boîtes→${x.unite} (facteur ${x.facteur})`, unite_saisie: "boite",
      facteur_applique: x.facteur, compartiment: comp,
    });
    nConv++;
  }
}
console.log(`\n✅ ${nMeta} produits fractionnés · ${nConv} mouvements de conversion écrits`);

// ── Vérifier ─────────────────────────────────────────────────────────────────
const after = await pg("GET", "mouvements?select=produit_id,quantite&limit=20000");
const stockApres = {};
for (const m of after) stockApres[m.produit_id] = (stockApres[m.produit_id] ?? 0) + Number(m.quantite);
let ok = true;
for (const x of frac) {
  const attendu = x.stockBoites * x.facteur;
  const obtenu = stockApres[x.p.id] ?? 0;
  if (obtenu !== attendu) { console.log(`❌ ${x.p.id} ${x.p.designation}: attendu ${attendu}, obtenu ${obtenu}`); ok = false; }
}
console.log(ok ? "✅ Stock converti correctement (chaque produit = boîtes × facteur)" : "❌ ÉCART — vérifier");
