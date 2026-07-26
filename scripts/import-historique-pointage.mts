#!/usr/bin/env node
/**
 * REPRISE HISTORIQUE des pointages (mai + juin 2026, REX + MIARAKA).
 *
 * Importe les exports bruts ZKAccess dans le schéma `pointage`, en créant
 * au passage les agents et les badges manquants. Idempotent : les pointages
 * portent un id déterministe, relancer le script n'ajoute rien.
 *
 * ⚠️ Chaque installation numérote SES agents : le même « Personnel ID » 15
 * désigne Aina à REX et quelqu'un d'autre à MIARAKA. L'installation est donc
 * déduite du FICHIER (et non du champ Device Name, trompeur).
 *
 * Usage :
 *   npx tsx scripts/import-historique-pointage.mts            # simulation
 *   npx tsx scripts/import-historique-pointage.mts --apply
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

// .env.local (le script tourne hors Next).
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { parserClasseur, idPointage } = await import("../src/lib/pointage/parseur.ts");

const APPLY = process.argv.includes("--apply");
const DIR =
  "/Users/maxwilliamrafaliarison/Library/CloudStorage/OneDrive-Personnel/Documents/Centre REX/Pointage/pointages3derniersmois (1)/";

/** Fichier brut → installation d'origine (base de numérotation des IDs). */
const FICHIERS: Array<{ fichier: string; installation: "REX" | "MIARAKA" }> = [
  { fichier: "Pointage REX Mai 2026 BRUT.xlsx", installation: "REX" },
  { fichier: "MIARAKA BRUT mai 2026.xls", installation: "MIARAKA" },
  { fichier: "REX BRUT JUIN 2026.xlsx", installation: "REX" },
  { fichier: "POINTAGE BRUT MIARAKA JUIN 2026 .xlsx", installation: "MIARAKA" },
];

const URL_SB = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "")
  .trim()
  .replace(/\/+$/, "");
const KEY = (
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.PATIENTS_SUPABASE_SERVICE_KEY ||
  ""
).replace(/[^A-Za-z0-9._-]/g, "");
const H = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  "Accept-Profile": "pointage",
  "Content-Profile": "pointage",
};
async function pg(method: string, path: string, body?: unknown) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

const maintenant = new Date().toISOString();
let totalRetenus = 0;
const agentsVus = new Map<string, { id: string; prenom: string; site: string }>();
const badgesVus = new Map<string, { id: string; agent_id: string; installation: string; id_pointeuse: string }>();
const pointagesTous: Record<string, unknown>[] = [];

for (const { fichier, installation } of FICHIERS) {
  const wb = XLSX.readFile(DIR + fichier);
  const feuilles: Array<[string, unknown[][]]> = wb.SheetNames.map((n: string) => [
    n,
    XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true }),
  ]);
  const parse = parserClasseur(feuilles);
  totalRetenus += parse.pointages.length;
  console.log(
    `${fichier.padEnd(36).slice(0, 36)} [${installation.padEnd(7)}] ${String(parse.lignesLues).padStart(5)} lues → ${String(parse.pointages.length).padStart(5)} retenus (doublons ${parse.ignoreesDoublons}, parasites ${parse.ignoreesParasites})`,
  );

  for (const p of parse.pointages) {
    const agentId = `AG-${installation}-${p.idPointeuse}`;
    if (!agentsVus.has(agentId)) {
      agentsVus.set(agentId, {
        id: agentId,
        prenom: p.prenom || `Agent ${p.idPointeuse}`,
        site: installation,
      });
    }
    const badgeId = `BDG-${installation}-${p.idPointeuse}`;
    if (!badgesVus.has(badgeId)) {
      badgesVus.set(badgeId, { id: badgeId, agent_id: agentId, installation, id_pointeuse: p.idPointeuse });
    }
    pointagesTous.push({
      id: idPointage(p, installation),
      agent_id: agentId,
      site_pointage: p.appareil || installation,
      horodatage: p.horodatage,
      jour: p.jour,
      sens_brut: p.sensBrut,
      verif: p.verif,
      appareil: p.appareil,
      source: "import",
      importe_le: maintenant,
    });
  }
}

// Dédoublonnage global (un même pointage peut figurer dans deux fichiers).
const parId = new Map(pointagesTous.map((p) => [p.id as string, p]));
const pointages = [...parId.values()];

console.log(
  `\nTOTAL : ${totalRetenus} retenus → ${pointages.length} uniques · ${agentsVus.size} agents · ${badgesVus.size} badges`,
);
const jours = [...new Set(pointages.map((p) => p.jour as string))].sort();
console.log(`Période : ${jours[0]} → ${jours.at(-1)} (${jours.length} jours)`);

if (!APPLY) {
  console.log("\n(simulation — relancez avec --apply)");
  process.exit(0);
}

// 1. Agents (upsert : on ne remplace pas une fiche déjà complétée à la main).
const existants: Array<{ id: string }> = await pg("GET", "agents?select=id&limit=5000");
const idsExistants = new Set(existants.map((a) => a.id));
const nouveauxAgents = [...agentsVus.values()]
  .filter((a) => !idsExistants.has(a.id))
  .map((a) => ({
    id: a.id,
    nom: "",
    prenom: a.prenom,
    site: a.site,
    statut: "salarie",
    poste: "",
    service: "",
    horaire_id: "std",
    taux_horaire: 0,
    actif: true,
    createdat: maintenant,
  }));
if (nouveauxAgents.length) await pg("POST", "agents", nouveauxAgents);
console.log(`✅ ${nouveauxAgents.length} agents créés`);

// 2. Badges.
const badgesExistants: Array<{ id: string }> = await pg("GET", "badges?select=id&limit=5000");
const idsBadges = new Set(badgesExistants.map((b) => b.id));
const nouveauxBadges = [...badgesVus.values()]
  .filter((b) => !idsBadges.has(b.id))
  .map((b) => ({ ...b, valide_du: "", valide_au: "", note: "Reprise historique" }));
if (nouveauxBadges.length) await pg("POST", "badges", nouveauxBadges);
console.log(`✅ ${nouveauxBadges.length} badges créés`);

// 3. Pointages, par lots, en sautant ceux déjà présents.
// ⚠️ PostgREST plafonne chaque réponse à 1000 lignes : on pagine, sinon la
// liste des ids connus serait tronquée et l'idempotence illusoire.
const connus = new Set<string>();
for (let off = 0; ; off += 1000) {
  const page: Array<{ id: string }> = await pg("GET", `pointages?select=id&order=id.asc&limit=1000&offset=${off}`);
  page.forEach((r) => connus.add(r.id));
  if (page.length < 1000) break;
}
const aInserer = pointages.filter((p) => !connus.has(p.id as string));
const LOT = 500;
for (let i = 0; i < aInserer.length; i += LOT) {
  await pg("POST", "pointages", aInserer.slice(i, i + LOT));
  process.stdout.write(`\r  pointages insérés : ${Math.min(i + LOT, aInserer.length)}/${aInserer.length}`);
}
console.log(`\n✅ ${aInserer.length} pointages insérés (${pointages.length - aInserer.length} déjà présents)`);

// 4. Vérification.
const r = await fetch(`${URL_SB}/rest/v1/pointages?select=id&limit=1`, {
  method: "HEAD",
  headers: { ...H, Prefer: "count=exact" },
});
console.log(`\nVérification : ${(r.headers.get("content-range") ?? "?").split("/")[1]} pointages en base.`);
