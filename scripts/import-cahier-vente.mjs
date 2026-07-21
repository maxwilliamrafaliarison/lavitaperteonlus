#!/usr/bin/env node
/**
 * Reprise du CAHIER DE VENTE manuscrit (RUMER) dans l'application pharmacie.
 *
 * Transcription RUMER - Cahier de vente.xlsx (ventes 02–18 juillet 2026).
 * Chaque n° de facture (F00x/26) = une VENTE, avec ses lignes.
 *
 * ── DÉCISION (validée) : HISTORIQUE SEUL, SANS TOUCHER AU STOCK ────────────
 * On écrit ventes + lignes_vente (visibles dans /pharmacie/ventes et les
 * rapports), mais AUCUN mouvement de stock. Pourquoi :
 *   • les ventes d'avant le 13/07 sont déjà déduites du comptage initial du
 *     13/07 (les re-déduire ferait double emploi) ;
 *   • le cahier vend à l'unité (« 05 (1 bt) » = 5 comprimés) alors que le
 *     catalogue est en facteur = 1 : déduire « 5 » retirerait 5 boîtes.
 * La remise à niveau réelle du stock se fait par inventaire physique.
 *
 * Idempotent : ids VTE-CAHIER-* dérivés du n° de facture ; le RPC
 * enregistrer_vente ignore un id déjà présent. Relançable sans doublon.
 *
 * Usage :
 *   node --env-file=.env.local scripts/import-cahier-vente.mjs            # simulation
 *   node --env-file=.env.local scripts/import-cahier-vente.mjs --apply
 */
import { createRequire } from "node:module";
const XLSX = createRequire(process.cwd() + "/")("xlsx");

const APPLY = process.argv.includes("--apply");
const FICHIER = "/Users/maxwilliamrafaliarison/Downloads/RUMER - Cahier de vente.xlsx";
const TOTAL_ATTENDU = 1108550;

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

// ── 1. Lire + regrouper par facture ───────────────────────────────────────
const M = (s) => Number(String(s).replace(/,/g, ""));
const iso = (fr) => { const [j, m, a] = String(fr).split("/"); return `${a}-${m.padStart(2, "0")}-${j.padStart(2, "0")}`; };
const qteNum = (s) => { const m = String(s).match(/^0*(\d+)/); return m ? Number(m[1]) : 0; };

const wb = XLSX.readFile(FICHIER);
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Cahier de vente"], { header: 1, raw: false });
let curDate = null, curFac = null;
const ventes = new Map();
for (const r of rows.slice(3)) {
  if (!r || !r[3]) continue;
  if (r[0]) curDate = iso(r[0]);
  if (r[1]) curFac = String(r[1]).trim();
  if (!ventes.has(curFac)) ventes.set(curFac, { facture: curFac, date: curDate, lignes: [] });
  ventes.get(curFac).lignes.push({ produit: String(r[3]).trim(), qte: qteNum(r[4]), montant: M(r[5]) });
}

// ── 2. Rapprochement produits (nom + alias de graphie du cahier) ───────────
const prods = await pg("GET", "produits?select=id,designation,prix_vente&limit=1000");
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const ALIAS = {
  "acide fusidique": "ACIDE FUSIDIQUE", "ac fusidique": "ACIDE FUSIDIQUE",
  "ssi": "SODIUM CHLORURE  0,9%", "seringue 10": "SERINGUE 10ml", "seringue 5": "SERINGUE 5ml", "seringue": "SERINGUE 5ml",
  "oxacilline": "M-OXACILLINE", "zerodol": "ZERODOL", "compresse steril": "COMPRESSE STERYL", "compresse": "COMPRESSE STERYL",
  "bactoclave": "BACTOCLAV", "bactoclav": "BACTOCLAV", "rapiclav 625": "RAPICLAV 625", "rapiclav sachet": "RAPICLAV", "rapiclav": "RAPICLAV",
  "mag 2": "MAG-2", "eyevit": "EXEVIT C", "cyprozole": "CYPROZOLE FORTE", "ciprozole": "CYPROZOLE FORTE", "ciprofloxacine": "CIPROFLOXACINE",
  "amoxicilline": "ACCUCLAV 625", "cefixime": "CEFIXINE", "prednisolone": "PREDNOVA 20", "amlodipine": "AMNLODIPINE",
  "esomeprazole": "ESOFAG-20", "omeprazol": "OMEPRAZOLE", "desloratadine": "D-LOR", "ultra levure": "ULTRA-LEVURE", "ultralevure": "ULTRA-LEVURE",
  "x ton": "X'TOR-20", "sparadrap": "SPARADRAP", "hydrosol": "HYDROSOL", "glucose": "GLUCOSE", "itacane": "ITACARE", "primeran": "PRIMERAN",
};
function match(l) {
  const unit = l.montant / (l.qte || 1);
  const nd = norm(l.produit);
  for (const [a, c] of Object.entries(ALIAS)) if (nd.startsWith(a)) { const p = prods.find((x) => x.designation === c) || prods.find((x) => norm(x.designation).startsWith(norm(c))); if (p) return p; }
  const pm = nd.split(" ")[0];
  const cand = prods.filter((p) => norm(p.designation).split(" ")[0] === pm || norm(p.designation).startsWith(pm));
  if (cand.length === 1) return cand[0];
  if (cand.length > 1) { const byp = cand.filter((p) => Math.abs(p.prix_vente - unit) <= 2); if (byp.length === 1) return byp[0]; return cand[0]; }
  return null;
}

// ── 3. Construire les ventes documentaires (sans mouvement de stock) ───────
const slug = (f) => f.replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
const compteurJour = new Map(); // ordre déterministe intra-journée
const operations = [];
let totalGeneral = 0;
for (const v of ventes.values()) {
  const venteId = `VTE-CAHIER-${slug(v.facture)}`;
  const n = compteurJour.get(v.date) ?? 0; compteurJour.set(v.date, n + 1);
  const ts = `${v.date}T08:${String(n).padStart(2, "0")}:00.000Z`;
  const lignesRows = [];
  let total = 0;
  v.lignes.forEach((l, i) => {
    const p = match(l);
    if (!p) { console.error(`❌ ${v.facture} : « ${l.produit} » sans correspondance`); process.exit(1); }
    total += l.montant;
    lignesRows.push({
      id: `${venteId}-L${i + 1}`, vente_id: venteId, produit_id: p.id, lot_id: "",
      quantite: l.qte, prix_unitaire: l.qte ? Math.round(l.montant / l.qte) : l.montant,
      sous_total: l.montant, mode_vente: "boite",
      qte_stock_deduire: 0, // documentaire : rien n'est déduit du stock
    });
  });
  totalGeneral += total;
  operations.push({
    vente: {
      id: venteId, timestamp: ts, client_nom: "", type_vente: "cash", total,
      operateur_email: "system", statut: "active", pec_payeur: "", valeur_pec: 0,
    },
    lignesRows,
    libelle: `${v.date} ${v.facture} — ${lignesRows.length} ligne(s), ${total.toLocaleString("fr-FR")} Ar`,
  });
}

console.log(`${operations.length} ventes · ${operations.reduce((s, o) => s + o.lignesRows.length, 0)} lignes · total ${totalGeneral.toLocaleString("fr-FR")} Ar (attendu ${TOTAL_ATTENDU.toLocaleString("fr-FR")})`);
if (totalGeneral !== TOTAL_ATTENDU) { console.error("❌ Total ≠ attendu — transcription à revoir"); process.exit(1); }
console.log("✅ Total conforme au cahier.");

if (!APPLY) { console.log("\n(simulation — relancez avec --apply pour écrire)"); process.exit(0); }

// ── 4. Écrire via le RPC atomique enregistrer_vente (mouvements = []) ──────
for (const op of operations) {
  const r = await pg("POST", "rpc/enregistrer_vente", {
    p_vente: op.vente, p_lignes: op.lignesRows, p_mouvements: [],
  });
  console.log(`✅ ${op.libelle} → ${r}`);
}

// ── 5. Vérifier ────────────────────────────────────────────────────────────
const ecrites = await pg("GET", "ventes?id=like.VTE-CAHIER-*&select=id,total");
const lignesEcrites = await pg("GET", "lignes_vente?vente_id=like.VTE-CAHIER-*&select=id");
const mvtsCahier = await pg("GET", "mouvements?reference=like.VTE-CAHIER-*&select=id");
const totalEcrit = ecrites.reduce((s, v) => s + Number(v.total), 0);
console.log(`\nVérification : ${ecrites.length} ventes · ${lignesEcrites.length} lignes · ${mvtsCahier.length} mouvements de stock · total ${totalEcrit.toLocaleString("fr-FR")} Ar`);
console.log(
  ecrites.length === operations.length && totalEcrit === TOTAL_ATTENDU && mvtsCahier.length === 0
    ? "✅ TOUT CONFORME (stock non touché — 0 mouvement)"
    : "❌ ÉCART — vérifier",
);
