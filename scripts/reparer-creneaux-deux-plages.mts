#!/usr/bin/env node
/**
 * RÉPARATION DES JOURNÉES COUPÉES LUES SUR UNE SEULE LIGNE.
 *
 * `analyserEcriture` ne séparait deux plages que sur un retour ligne. Quand
 * la journée coupée tenait sur une seule ligne, deux choses arrivaient :
 *
 *   « 8H30 - 12H 14H30 - 17H »    → 08:30 à 12:14, lieu « H30 - 17H »
 *   « 8H-12H / 14H-17H\nankofafa » → 08:00 à 12:00, lieu « / 14H-17H »
 *
 * Dans le premier cas le « 14 » de l'après-midi était avalé comme les
 * minutes du matin ; dans le second l'après-midi partait en guise de lieu,
 * et le vrai lieu était perdu puisque la place était déjà prise. L'écriture
 * ressortait `reconnu: true`, si bien que rien ne le signalait.
 *
 * Le module est corrigé. Ce script rattrape les lignes déjà écrites.
 *
 * La source de vérité est le champ `note`, qui conserve la cellule d'origine
 * C'est précisément ce à quoi il sert. L'import y a remplacé les retours
 * ligne par « / » ; on refait le chemin inverse avant de relire, sans quoi
 * le lieu resterait collé à la seconde plage.
 *
 * Usage :
 *   npx tsx scripts/reparer-creneaux-deux-plages.mts            # simulation
 *   npx tsx scripts/reparer-creneaux-deux-plages.mts --apply
 */
import { readFileSync, writeFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { analyserEcriture } = await import("../src/lib/planning/creneau.ts");

const APPLY = process.argv.includes("--apply");
const U = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const K = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
const hdr = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", "Accept-Profile": "planning", "Content-Profile": "planning" };
async function pg(method: string, path: string, body?: unknown) {
  const r = await fetch(`${U}/rest/v1/${path}`, { method, headers: hdr, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

interface Aff { id: string; jour: string; agent_id: string; debut: string; fin: string; lieu: string; note: string }

const tout: Aff[] = [];
for (let o = 0; ; o += 1000) {
  const p: Aff[] = await pg("GET", `affectations?select=id,jour,agent_id,debut,fin,lieu,note&order=id.asc&limit=1000&offset=${o}`);
  tout.push(...p);
  if (p.length < 1000) break;
}

/* Un lieu qui commence par « / » ou par « H » n'est pas un lieu : c'est un
   morceau d'horaire tombé dans la mauvaise case. C'est la signature exacte
   du défaut, et elle ne peut pas atteindre un vrai nom de quartier. */
const casses = tout.filter((a) => /^[/H]/.test(a.lieu ?? ""));
console.log(`${tout.length} affectations lues · ${casses.length} au lieu corrompu`);

const corrections: Array<Record<string, unknown>> = [];
const invariantes: string[] = [];
for (const a of casses) {
  const an = analyserEcriture((a.note ?? "").split(" / ").join("\n"));
  if (an.plages.length < 2) { invariantes.push(`${a.id} : note « ${a.note} » toujours illisible`); continue; }
  const debut = an.plages[0].debut;
  const fin = an.plages[an.plages.length - 1].fin;
  if (debut === a.debut && fin === a.fin && an.lieu === a.lieu) continue;
  corrections.push({ id: a.id, debut, fin, lieu: an.lieu });
  console.log(`  ${a.jour} ${a.agent_id.padEnd(16)} ${a.debut}-${a.fin} lieu «${a.lieu}»  →  ${debut}-${fin} lieu «${an.lieu}»`);
}
if (invariantes.length) {
  console.log(`\n⚠ ${invariantes.length} ligne(s) non réparables, laissées en l'état :`);
  invariantes.forEach((s) => console.log("   " + s));
}
console.log(`\n${corrections.length} correction(s) à appliquer`);

if (!APPLY) {
  console.log("(simulation : relancez avec --apply)");
  process.exit(0);
}

const sauvegarde = `/tmp/affectations-avant-reparation-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(sauvegarde, JSON.stringify(casses, null, 2));
console.log(`état d'origine sauvegardé : ${sauvegarde}`);

for (const c of corrections) {
  const { id, ...champs } = c;
  await pg("PATCH", `affectations?id=eq.${id}`, champs);
}
console.log(`✅ ${corrections.length} affectation(s) réparée(s)`);
