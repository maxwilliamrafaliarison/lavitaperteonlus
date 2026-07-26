#!/usr/bin/env node
/**
 * Initialise le STOCK des préparations galéniques (LG-xxx) à partir du
 * « RESTE EN STOCK » de fin juin (GESTION LABO GALENIQUE JUIN 2026.xlsx).
 *
 * Rapprochement classeur ↔ produit fait À LA MAIN (table vérifiée ci-dessous) :
 * l'auto-matching est impossible ici (prix du classeur PAR GRAMME, noms
 * divergents BETADINE↔Iodépovidone, doses/formes qui se télescopent). Chaque
 * valeur est tracée : reste du classeur → conversion → stock vendable.
 *   • crèmes (g) / solutions (ml) → ÷ taille du conditionnement (tube/flacon)
 *   • suppositoires, ovules, capsules, flacons, sachets → 1 pour 1
 *
 * Stock posé par un mouvement 'entree' daté du 30/06, idempotent (MVT-INITLG-*).
 *
 * Usage :
 *   node --env-file=.env.local scripts/init-stock-galenique.mjs           # simulation
 *   node --env-file=.env.local scripts/init-stock-galenique.mjs --apply
 */
const APPLY = process.argv.includes("--apply");
const TS = "2026-06-30T17:00:00.000Z";

const URL_SB = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Accept-Profile": "pharmacie", "Content-Profile": "pharmacie" };
async function pg(method, path, body) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 200)}`); return t ? JSON.parse(t) : null;
}

// Table vérifiée : LG id → { stock vendable, origine de la valeur }.
// (Non listés = reste juin nul → restent à 0.)
const STOCK = {
  "LG-001": { q: 9, src: "Econazole 1% crème 225 g ÷ 25 g/tube" },
  "LG-003": { q: 3, src: "Neomycine 0,5% crème 150 g ÷ 50 g/tube" },
  "LG-005": { q: 4, src: "Ketoprofen 5% gel 100 g ÷ 25 g/tube" },
  "LG-006": { q: 17, src: "Crevasse (Crevesse sein main) 170 g ÷ 10 g/tube" },
  "LG-007": { q: 3, src: "Bétadine cutanée (Iodépovidone) 300 ml ÷ 100 ml/flacon" },
  "LG-008": { q: 4, src: "Bétadine gynéco (Iodépovidone) 400 ml ÷ 100 ml/flacon" },
  "LG-009": { q: 10, src: "Perméthrine suspension 1000 ml ÷ 100 ml/flacon" },
  "LG-012": { q: 30, src: "Paracétamol suppositoire 125 mg — 30 unités" },
  "LG-013": { q: 33, src: "Paracétamol suppositoire 100 mg — 33 unités" },
  "LG-014": { q: 83, src: "Éconazole ovule 150 mg — 83 unités" },
  "LG-015": { q: 201, src: "Métronidazole ovule 500 mg — 201 unités" },
  "LG-017": { q: 200, src: "Amoxicilline 250 mg susp. 10 doses — 200 flacons" },
  "LG-018": { q: 80, src: "Calcium 500 mg + VIT. D3 — 80 sachets" },
  "LG-022": { q: 276, src: "Acide folique 1 mg — 276 capsules" },
  "LG-023": { q: 290, src: "Amoxicilline 500 mg — 290 capsules" },
  "LG-024": { q: 100, src: "Carbocystéine — 100 capsules" },
  "LG-025": { q: 372, src: "Fer + acide folique + vit. C — 372 capsules" },
  "LG-026": { q: 134, src: "Ibuprofène 200 mg — 134 capsules" },
  "LG-027": { q: 216, src: "Métronidazole 500 mg capsule — 216 capsules" },
  "LG-030": { q: 310, src: "Paracétamol 500 mg capsule — 310 capsules" },
  "LG-031": { q: 499, src: "Vitamine B complexe — 499 capsules" },
};

const lg = await pg("GET", "produits?origine=eq.galenique&select=id,designation,conditionnement&order=id.asc");
const parId = new Map(lg.map((p) => [p.id, p]));

console.log("Stock initial galénique (reste fin juin 2026) :\n");
let total = 0;
for (const [id, { q, src }] of Object.entries(STOCK)) {
  const p = parId.get(id);
  if (!p) { console.error(`❌ ${id} introuvable dans l'app`); process.exit(1); }
  console.log(`  ${id} ${p.designation.padEnd(30).slice(0, 30)} → ${String(q).padStart(4)}   (${src})`);
  total += q;
}
console.log(`\n${Object.keys(STOCK).length} préparations à stocker · ${lg.length - Object.keys(STOCK).length} restent à 0 · total ${total} unités.`);

if (!APPLY) { console.log("\n(simulation — relancez avec --apply)"); process.exit(0); }

let n = 0;
for (const [id, { q }] of Object.entries(STOCK)) {
  const p = parId.get(id);
  const lotId = `LOT-INITLG-${id}`, mvtId = `MVT-INITLG-${id}`;
  if ((await pg("GET", `mouvements?id=eq.${mvtId}&select=id`)).length) { console.log(`= ${id} déjà initialisé`); continue; }
  if (!(await pg("GET", `lots?id=eq.${lotId}&select=id`)).length) {
    await pg("POST", "lots", { id: lotId, produit_id: id, numero_lot: "INIT-JUIN-2026", date_expiration: "", date_reception: "2026-06-30", contenance: p.conditionnement });
  }
  await pg("POST", "mouvements", {
    id: mvtId, timestamp: TS, produit_id: id, lot_id: lotId, type: "entree", quantite: q,
    prix_unitaire: 0, reference: "init-galenique-juin-2026", user_email: "system",
    note: "Stock initial labo galénique (reste juin 2026)", unite_saisie: "boite", facteur_applique: 1, compartiment: "gros",
  });
  console.log(`✅ ${id} ${p.designation} → ${q}`);
  n++;
}
const check = await pg("GET", "mouvements?reference=eq.init-galenique-juin-2026&select=quantite");
console.log(`\n✅ ${n} initialisées · vérif : ${check.length} mouvements · ${check.reduce((s, m) => s + Number(m.quantite), 0)} unités posées.`);
