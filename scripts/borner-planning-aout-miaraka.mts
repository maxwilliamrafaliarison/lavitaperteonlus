#!/usr/bin/env node
/**
 * CHEVAUCHEMENT AOÛT / SEPTEMBRE À MIARAKA.
 *
 * Les feuilles mensuelles se recouvrent d'une semaine : « aout 26 » court
 * jusqu'au 6 septembre, et « septembre 26 » commence le 31 août. Les deux
 * décrivent donc les sept mêmes jours, et pas de la même façon.
 *
 * ── CE QUE LA COMPARAISON CELLULE À CELLULE A DONNÉ ──────────────────────
 * 49 cellules identiques, 30 écarts. La version de septembre :
 *   · AJOUTE les gardes de nuit TOMA et MAURICE sur les sept jours, que la
 *     feuille d'août laissait vides (elle renvoyait à l'onglet « sec Aout ») ;
 *   · DÉCALE la rotation des gardes de 24 h : le 1er septembre, LALAO cède
 *     la place à DIAMONDRA ; le 4, ANICO à FENO ; et ainsi de suite ;
 *   · passe FENO en congé le 31 août au lieu d'un service de 24 h ;
 *   · précise le lieu d'EMMA le 6 septembre (Ankofafa).
 *
 * La feuille de septembre est la version la plus récente et la plus
 * complète : elle fait foi. Sans arbitrage, les deux plannings coexisteraient
 * et chaque agent apparaîtrait DEUX FOIS sur ces sept jours, avec des
 * horaires contradictoires, et le calcul des écarts ne saurait pas
 * lequel des deux il doit croire.
 *
 * On borne donc le planning d'août au 30 août, et on retire ses affectations
 * postérieures. Rien n'est perdu : elles sont sauvegardées avant, et la
 * feuille « aout 26 » du classeur les porte toujours.
 *
 * Usage :
 *   npx tsx scripts/borner-planning-aout-miaraka.mts            # simulation
 *   npx tsx scripts/borner-planning-aout-miaraka.mts --apply
 */
import { readFileSync, writeFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const APPLY = process.argv.includes("--apply");
const PLANNING = "PLN-MIARAKA-20260727";
const DERNIER_JOUR = "2026-08-30"; // la veille du premier jour de septembre

const U = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const K = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
const hdr = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", "Accept-Profile": "planning", "Content-Profile": "planning" };
async function pg(method: string, path: string, body?: unknown) {
  const r = await fetch(`${U}/rest/v1/${path}`, { method, headers: hdr, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

const [plan] = await pg("GET", `plannings?select=*&id=eq.${PLANNING}`);
if (!plan) throw new Error(`Planning ${PLANNING} introuvable.`);
console.log(`${plan.id} : ${plan.du} → ${plan.au}  (${plan.statut})`);

const trop: Array<{ id: string; jour: string; agent_id: string; debut: string; fin: string; note: string }> =
  await pg("GET", `affectations?select=id,jour,agent_id,debut,fin,note&planning_id=eq.${PLANNING}&jour=gt.${DERNIER_JOUR}&order=jour.asc,agent_id.asc&limit=1000`);

console.log(`\n${trop.length} affectation(s) postérieures au ${DERNIER_JOUR}, reprises par la feuille de septembre :`);
const parJour = new Map<string, number>();
for (const a of trop) parJour.set(a.jour, (parJour.get(a.jour) ?? 0) + 1);
for (const [j, n] of [...parJour].sort()) console.log(`  ${j} : ${n}`);

if (!APPLY) {
  console.log("\n(simulation : relancez avec --apply)");
  process.exit(0);
}

const sauvegarde = `/tmp/${PLANNING}-semaine-retiree-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(sauvegarde, JSON.stringify({ planning: plan, affectations: trop }, null, 2));
console.log(`\nétat d'origine sauvegardé : ${sauvegarde}`);

await pg("DELETE", `affectations?planning_id=eq.${PLANNING}&jour=gt.${DERNIER_JOUR}`);
await pg("PATCH", `plannings?id=eq.${PLANNING}`, {
  au: DERNIER_JOUR,
  libelle: `Planning MIARAKA du ${plan.du} au ${DERNIER_JOUR}`,
  modifie_par: "borner-planning-aout-miaraka",
  modifie_le: new Date().toISOString(),
  note: `${plan.note} Borné au ${DERNIER_JOUR}, la semaine suivante étant reprise par la feuille « septembre 26 ».`,
});
console.log(`✅ ${trop.length} affectation(s) retirées · planning borné au ${DERNIER_JOUR}`);
