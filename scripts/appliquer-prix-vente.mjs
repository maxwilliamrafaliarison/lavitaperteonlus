#!/usr/bin/env node
/**
 * Calcule et applique les prix de vente manquants de la pharmacie.
 *
 * RÈGLE : prix_vente = prix_achat × COEF, arrondi à l'Ariary.
 *
 * Le coefficient n'est pas choisi arbitrairement : il est constaté sur les
 * produits déjà tarifés. Au 15/07/2026, les 34 produits ayant les deux prix
 * affichaient TOUS exactement ×1,300 (marge 30 %) — médiane, moyenne et
 * quartiles confondus, zéro exception. Le script revérifie ce constat à
 * chaque exécution et REFUSE d'agir si les données ne le confirment plus
 * (règle changée, produit hors barème…) : mieux vaut s'arrêter que
 * propager un mauvais tarif sur tout le catalogue.
 *
 * Ne touche QUE les produits actifs dont le prix de vente est absent et le
 * prix d'achat connu. N'écrase jamais un prix existant.
 *
 * Usage :
 *   node scripts/appliquer-prix-vente.mjs              # simulation (défaut)
 *   node scripts/appliquer-prix-vente.mjs --apply      # écriture réelle
 *   node scripts/appliquer-prix-vente.mjs --coef=1.35  # forcer un coefficient
 */

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const coefArg = args.find((a) => a.startsWith("--coef="));
const COEF_FORCE = coefArg ? Number(coefArg.split("=")[1]) : null;

const url = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "")
  .trim()
  .replace(/\/+$/, "");
const key = (
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.PATIENTS_SUPABASE_SERVICE_KEY ||
  ""
).replace(/[^A-Za-z0-9._-]/g, "");

if (!url || !key) {
  console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_KEY manquants (.env.local)");
  process.exit(1);
}

const H = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Accept-Profile": "pharmacie",
  "Content-Profile": "pharmacie",
  "Content-Type": "application/json",
};

const fmt = (n) => n.toLocaleString("fr-FR") + " Ar";

const res = await fetch(`${url}/rest/v1/produits?select=*`, { headers: H });
if (!res.ok) {
  console.error(`❌ lecture produits : HTTP ${res.status}`);
  process.exit(1);
}
const produits = await res.json();
const actifs = produits.filter((p) => p.statut === "actif");

// --- 1. Constater le coefficient sur les produits déjà tarifés ------------
const tarifes = actifs.filter((p) => p.prix_achat > 0 && p.prix_vente > 0);
if (tarifes.length === 0) {
  console.error("❌ aucun produit tarifé : impossible de constater un coefficient.");
  process.exit(1);
}
const coefs = tarifes.map((p) => p.prix_vente / p.prix_achat).sort((a, b) => a - b);
const median = coefs[Math.floor(coefs.length / 2)];
const conformes = coefs.filter((c) => Math.abs(c - median) < 0.005).length;
const partConforme = conformes / coefs.length;

console.log(`Produits tarifés analysés : ${tarifes.length}`);
console.log(`Coefficient médian constaté : ×${median.toFixed(4)} (marge ${((median - 1) * 100).toFixed(1)} %)`);
console.log(`Conformes à ±0,5 % : ${conformes}/${coefs.length} (${(partConforme * 100).toFixed(0)} %)\n`);

const COEF = COEF_FORCE ?? median;

if (COEF_FORCE) {
  console.log(`⚠️  Coefficient FORCÉ à ×${COEF} (option --coef)\n`);
} else if (partConforme < 0.9) {
  console.error(
    `❌ ARRÊT : seuls ${(partConforme * 100).toFixed(0)} % des produits suivent le coefficient médian.\n` +
      `   La règle de tarification n'est plus uniforme — un calcul automatique appliquerait\n` +
      `   un tarif faux à tout le catalogue. Vérifiez les prix, ou forcez avec --coef=X.`,
  );
  process.exit(1);
}

// --- 2. Cibler les produits à tarifer -------------------------------------
const aTarifer = actifs.filter(
  (p) => (!p.prix_vente || p.prix_vente <= 0) && p.prix_achat > 0,
);
const sansAchat = actifs.filter(
  (p) => (!p.prix_vente || p.prix_vente <= 0) && (!p.prix_achat || p.prix_achat <= 0),
);

if (aTarifer.length === 0) {
  console.log("✅ Aucun prix de vente à calculer.");
  process.exit(0);
}

console.log(`${aTarifer.length} produit(s) à tarifer${APPLY ? "" : "  [SIMULATION]"}\n`);
console.log("id        produit                        achat        → vente calculé");
console.log("─".repeat(74));

const patches = [];
for (const p of aTarifer.sort((a, b) => a.id.localeCompare(b.id))) {
  const prixVente = Math.round(p.prix_achat * COEF);
  patches.push({ id: p.id, prix_vente: prixVente });
  console.log(
    `${p.id.padEnd(9)} ${String(p.designation).slice(0, 28).padEnd(29)} ${fmt(p.prix_achat).padStart(12)} → ${fmt(prixVente).padStart(12)}`,
  );
}

if (sansAchat.length > 0) {
  console.log(
    `\n⚠️  ${sansAchat.length} produit(s) IGNORÉ(S) — prix d'achat inconnu, rien à calculer :`,
  );
  for (const p of sansAchat) console.log(`     ${p.id}  ${p.designation}`);
}

if (!APPLY) {
  console.log("\n(simulation — relancez avec --apply pour écrire)");
  process.exit(0);
}

// --- 3. Écrire ------------------------------------------------------------
let ok = 0;
for (const patch of patches) {
  const r = await fetch(`${url}/rest/v1/produits?id=eq.${encodeURIComponent(patch.id)}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ prix_vente: patch.prix_vente }),
  });
  if (r.ok) ok++;
  else console.error(`  ❌ ${patch.id} : HTTP ${r.status} ${(await r.text()).slice(0, 90)}`);
}
console.log(`\n✅ ${ok}/${patches.length} prix appliqués (coefficient ×${COEF.toFixed(4)}).`);
