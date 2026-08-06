#!/usr/bin/env node
/**
 * IMPORT DU CAHIER DE VENTE — labo galénique, 1er juillet au 6 août 2026.
 *
 * 186 lignes relevées du cahier RUMER. Chaque ligne devient une vente
 * datée du jour où elle a été faite : le stock sort à sa vraie date, et
 * les rapports de juillet la comptent.
 *
 * ── LES ARBITRAGES ───────────────────────────────────────────────────────
 * Le cahier et le catalogue ne parlent pas la même langue. Les
 * correspondances sont posées à la main, jamais devinées par ressemblance
 * de libellé — un rapprochement approximatif sur des médicaments fait
 * sortir le mauvais produit du stock.
 *
 * MÉTRONIDAZOLE. Le cahier distingue « cp » et « gél » ; le laboratoire ne
 * fabrique QUE des gélules (confirmé par le responsable). Les deux
 * libellés désignent donc le même produit, à 500 Ar. L'« ovule » est un
 * troisième produit, à 2 000 Ar. Le catalogue portait deux entrées
 * homonymes que rien ne distinguait : la seconde est renommée pour dire
 * ce qu'elle est.
 *
 * LES PRIX VIENNENT DU CAHIER, pas du catalogue. Une vente constate ce qui
 * a été encaissé ; le tarif affiché aujourd'hui peut avoir changé depuis
 * juillet. Là où les deux divergent — Bétadine gynécologique à 3 000 au
 * cahier contre 6 000 au catalogue — c'est le cahier qui fait foi pour
 * l'historique, et le catalogue qui vaut pour demain.
 *
 * Usage :
 *   npx tsx scripts/import-cahier-galenique.mts            (lecture seule)
 *   npx tsx scripts/import-cahier-galenique.mts --apply
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const APPLY = process.argv.includes("--apply");
const XLSX = createRequire(import.meta.url)("xlsx");

const { listProduitsAvecStock, enregistrerVente, appendRows, updateProduitFields, PHARMA_SHEETS } =
  await import("../src/lib/pharmacie/sheets.ts");

const FICHIER =
  "/Users/maxwilliamrafaliarison/Downloads/Cahier de vente - Labo galénique juillet 2026.xlsx";

/* ── Correspondances arbitrées ────────────────────────────────────────────
   Clé = libellé du cahier ; valeur = identifiant au catalogue, ou `null`
   pour un produit à créer (avec son prix relevé au cahier). */
const CORRESPONDANCES: Record<string, string | null> = {
  "Acide folique": "LG-022",
  "Amoxicilline 500 mg": "LG-023",
  "Calcium + Vitamine D3": "LG-018",
  "FAF": "LG-025",
  "Paracétamol 500 mg": "LG-030",
  "Vitamine B complexe": "LG-031",
  "Vitamine C 500 mg": "LG-021",
  "Bétadine gynécologique": "LG-008",
  "Crème crevasses": "LG-006",
  "Éconazole crème": "LG-001",
  "Kétoprofène crème": "LG-005",
  "Éconazole ovule": "LG-014",
  // Le labo ne fabrique que des gélules : « cp » et « gél » sont le même.
  "Métronidazole 500 mg cp": "LG-027",
  "Métronidazole 500 mg gél": "LG-027",
  "Métronidazole 500 mg ovule": "LG-015",
  // Absents du catalogue : créés avec le prix du cahier.
  "Ananambo": null,
  "Pommade Cicatridine": null,
  "Boîte (conditionnement)": null,
  "Gel vaginal": null,
  "FAF + Vitamine C": null,
  "Acide folique + Paracétamol": null,
};

/** Prix de vente des produits à créer, relevés au cahier. */
const PRIX_NOUVEAUX: Record<string, number> = {
  "Ananambo": 2000,
  "Pommade Cicatridine": 8000,
  "Boîte (conditionnement)": 700,
  "Gel vaginal": 5700,
  "FAF + Vitamine C": 50,
  "Acide folique + Paracétamol": 117,
};

// ── Lecture du cahier ─────────────────────────────────────────────────────
const wb = XLSX.readFile(FICHIER);
const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["Cahier de vente"], {
  header: 1,
  defval: "",
});
const EPOQUE = Date.UTC(1899, 11, 30);
const lignes = rows
  .slice(3)
  .filter((r) => r[0] && r[3])
  .map((r) => ({
    jour: new Date(EPOQUE + Number(r[0]) * 86400000).toISOString().slice(0, 10),
    num: Number(r[1]),
    produit: String(r[3]).trim(),
    qte: Number(r[4]) || 0,
    pu: Number(r[5]) || 0,
    montant: Number(r[6]) || 0,
  }))
  .filter((l) => l.qte > 0);

console.log(`${lignes.length} lignes · ${lignes[0].jour} → ${lignes.at(-1)!.jour}`);
console.log(`total : ${lignes.reduce((s, l) => s + l.montant, 0).toLocaleString("fr-FR")} Ar\n`);

const inconnus = [...new Set(lignes.map((l) => l.produit))].filter(
  (p) => !(p in CORRESPONDANCES),
);
if (inconnus.length) {
  console.error("⚠ Libellés sans correspondance arbitrée :\n  " + inconnus.join("\n  "));
  process.exit(1);
}

const produits = await listProduitsAvecStock();
const parId = new Map(produits.map((p) => [p.id, p]));
const aCreer = [...new Set(Object.entries(CORRESPONDANCES).filter(([, v]) => v === null).map(([k]) => k))];

console.log(`${aCreer.length} produit(s) à créer : ${aCreer.join(", ")}`);
const parJour = new Map<string, typeof lignes>();
for (const l of lignes) {
  const e = parJour.get(l.jour) ?? [];
  e.push(l);
  parJour.set(l.jour, e);
}
console.log(`${parJour.size} journées → ${lignes.length} ventes à enregistrer\n`);

if (!APPLY) {
  console.log("(lecture seule — relancez avec --apply pour enregistrer)");
  process.exit(0);
}

// ── Création des produits manquants ───────────────────────────────────────
const now = new Date().toISOString();
let suivant =
  1 +
  produits
    .map((p) => Number(/^LG-(\d+)$/.exec(p.id)?.[1] ?? 0))
    .reduce((a, b) => Math.max(a, b), 0);

const nouvelles: unknown[][] = [];
for (const nom of aCreer) {
  const id = `LG-${String(suivant++).padStart(3, "0")}`;
  const prix = PRIX_NOUVEAUX[nom] ?? 0;
  nouvelles.push([
    id, "", nom.toUpperCase(), "", "", "", "", "", Math.round(prix * 0.6), prix, 0, 1,
    "Labo galénique", "", "actif", now, 1, "", 0, "Préparation labo galénique",
  ]);
  CORRESPONDANCES[nom] = id;
  parId.set(id, { id, designation: nom.toUpperCase(), facteur_conversion: 1 } as never);
  console.log(`  + ${id}  ${nom.padEnd(30)} ${prix.toLocaleString("fr-FR")} Ar`);
}
if (nouvelles.length) await appendRows(PHARMA_SHEETS.produits, nouvelles);

/* Le catalogue portait deux « Métronidazole 500 mg » que rien ne
   distinguait. Celui à 2 000 Ar est l'ovule : on le nomme. */
await updateProduitFields("LG-015", { designation: "MÉTRONIDAZOLE 500 MG OVULE" });
console.log("  ~ LG-015 renommé « MÉTRONIDAZOLE 500 MG OVULE »\n");

// ── Enregistrement des ventes ─────────────────────────────────────────────
let n = 0;
let echecs = 0;
for (const [jour, duJour] of [...parJour.entries()].sort()) {
  for (const l of duJour) {
    const produitId = CORRESPONDANCES[l.produit]!;
    /* Identifiant DÉTERMINISTE : relancer l'import ne duplique rien, la
       clé primaire rejetant le doublon. */
    const venteId = `VTE-GAL-${jour.replace(/-/g, "")}-${String(l.num).padStart(3, "0")}`;
    const timestamp = `${jour}T12:00:00.000Z`;
    const pu = l.qte > 0 ? Math.round(l.montant / l.qte) : 0;
    try {
      await enregistrerVente({
        venteRow: [venteId, timestamp, "", "cash", l.montant, "informatique.lavitaperte@gmail.com", "active", "", 0],
        /* Neuf colonnes, lot_id compris : sans lui, « boite » atterrissait
           dans prix_unitaire et Postgres refusait la ligne. Lot vide — le
           cahier ne le note pas, et une préparation galénique n'en porte
           pas toujours. */
        lignesRows: [[`${venteId}-L1`, venteId, produitId, "", l.qte, pu, l.montant, "boite", l.qte]],
        mouvementsRows: [[
          `${venteId}-M1`, timestamp, produitId, "", "vente", -l.qte, pu, venteId,
          "informatique.lavitaperte@gmail.com", `Cahier galénique ${jour}`, "boite", 1, "gros",
        ]],
      } as never);
      n += 1;
    } catch (e) {
      echecs += 1;
      if (echecs <= 3) console.error(`  ✗ ${venteId} · ${l.produit} : ${String(e).slice(0, 110)}`);
    }
  }
}

console.log(`\n✅ ${n} ventes enregistrées${echecs ? ` · ${echecs} échec(s)` : ""}.`);
