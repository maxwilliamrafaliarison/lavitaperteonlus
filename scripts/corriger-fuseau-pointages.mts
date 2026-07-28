#!/usr/bin/env node
/**
 * CORRECTION DU DÉCALAGE HORAIRE des pointages collectés par le réseau.
 *
 * ── CE QUI S'EST PASSÉ ───────────────────────────────────────────────────
 * Le collecteur lisait les composants UTC de la date rendue par node-zklib
 * au lieu de la formater dans le fuseau des centres. Chaque badgeage a donc
 * été enregistré TROIS HEURES TROP TÔT : l'arrivée d'Aina à 08h00 figure à
 * 05h00. Vérifié par recoupement — le même passage, à la seconde près, vaut
 * 08:00:45 dans l'import par fichier et 05:00:45 dans la collecte réseau.
 *
 * ── CE QUE FAIT CE SCRIPT ────────────────────────────────────────────────
 * Il n'agit QUE sur les pointages de source « collecteur » et « agent ».
 * Ceux issus des fichiers ZKAccess sont justes : leur horodatage est recopié
 * tel quel depuis le texte, sans conversion. Les corriger ajouterait l'erreur
 * inverse.
 *
 * L'identifiant d'un pointage contient son horodatage : le décaler change
 * donc son identité, et peut le faire entrer en COLLISION avec le même
 * passage déjà importé par fichier. Le script réinsère sous le bon
 * identifiant, ignore les collisions (le passage est déjà là, correctement
 * daté) puis supprime les lignes fautives. Rien n'est écrasé à l'aveugle.
 *
 * Usage :
 *   npx tsx scripts/corriger-fuseau-pointages.mts            # simulation
 *   npx tsx scripts/corriger-fuseau-pointages.mts --apply
 */
import { readFileSync } from "node:fs";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const APPLY = process.argv.includes("--apply");
const DECALAGE_MIN = 180; // Madagascar est à UTC+3, sans heure d'été.

const U = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const K = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", "Accept-Profile": "pointage", "Content-Profile": "pointage" };
async function pg(method: string, path: string, body?: unknown) {
  const r = await fetch(`${U}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 180)}`);
  return t ? JSON.parse(t) : null;
}

interface Ptg {
  id: string; agent_id: string; site_pointage: string; horodatage: string;
  jour: string; sens_brut: string; verif: string; appareil: string;
  source: string; importe_le: string;
}

/** "YYYY-MM-DD HH:MM:SS" + N minutes, en franchissant minuit si besoin. */
function decaler(horodatage: string, minutes: number): string {
  const [d, h] = horodatage.split(" ");
  const t = Date.parse(`${d}T${h}Z`);
  if (Number.isNaN(t)) return horodatage;
  return new Date(t + minutes * 60000).toISOString().replace("T", " ").slice(0, 19);
}

const lireTout = async (filtre: string): Promise<Ptg[]> => {
  const out: Ptg[] = [];
  for (let off = 0; ; off += 1000) {
    const p: Ptg[] = await pg("GET", `pointages?select=*&${filtre}&order=id.asc&limit=1000&offset=${off}`);
    out.push(...p);
    if (p.length < 1000) break;
  }
  return out;
};

const fautifs = await lireTout("or=(source.eq.collecteur,source.eq.agent)");
const tousIds = new Set<string>();
for (let off = 0; ; off += 1000) {
  const p: Array<{ id: string }> = await pg("GET", `pointages?select=id&order=id.asc&limit=1000&offset=${off}`);
  p.forEach((x) => tousIds.add(x.id));
  if (p.length < 1000) break;
}

const corriges: Record<string, unknown>[] = [];
const collisions: string[] = [];
for (const p of fautifs) {
  const horodatage = decaler(p.horodatage, DECALAGE_MIN);
  const jour = horodatage.slice(0, 10);
  const nouvelId = `PTG-${p.site_pointage}-${p.agent_id.replace(/^AG-[A-Z]+-/, "")}-${horodatage.replace(/[^0-9]/g, "")}`;
  if (tousIds.has(nouvelId)) {
    // Le passage existe déjà, correctement daté par l'import fichier.
    collisions.push(p.id);
    continue;
  }
  tousIds.add(nouvelId);
  corriges.push({
    id: nouvelId, agent_id: p.agent_id, site_pointage: p.site_pointage,
    horodatage, jour, sens_brut: p.sens_brut, verif: p.verif, appareil: p.appareil,
    source: p.source, importe_le: p.importe_le,
  });
}

console.log(`${fautifs.length} pointages à recaler (+${DECALAGE_MIN / 60} h)`);
console.log(`  ${corriges.length} réinsérés sous le bon horodatage`);
console.log(`  ${collisions.length} déjà présents via l'import fichier → simplement supprimés`);
if (fautifs.length) {
  const e = fautifs[0];
  console.log(`\nExemple : ${e.agent_id} ${e.horodatage} → ${decaler(e.horodatage, DECALAGE_MIN)}`);
}

if (!APPLY) {
  console.log("\n(simulation — relancez avec --apply)");
  process.exit(0);
}

for (let i = 0; i < corriges.length; i += 500) {
  await pg("POST", "pointages", corriges.slice(i, i + 500));
  process.stdout.write(`\r  insérés : ${Math.min(i + 500, corriges.length)}/${corriges.length}`);
}
console.log();

// Suppression des lignes fautives, une fois les bonnes en place.
const aSupprimer = fautifs.map((p) => p.id);
for (let i = 0; i < aSupprimer.length; i += 200) {
  const lot = aSupprimer.slice(i, i + 200).map((x) => `"${x}"`).join(",");
  await pg("DELETE", `pointages?id=in.(${lot})`);
  process.stdout.write(`\r  supprimés : ${Math.min(i + 200, aSupprimer.length)}/${aSupprimer.length}`);
}
console.log(`\n✅ ${corriges.length} recalés · ${collisions.length} doublons retirés`);
