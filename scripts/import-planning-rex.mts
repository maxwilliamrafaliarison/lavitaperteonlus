#!/usr/bin/env node
/**
 * REPRISE DES PLANNINGS REX (feuilles hebdomadaires par service).
 *
 * Crée un planning par semaine et une affectation par (agent, jour, service).
 * Idempotent : identifiants déterministes, relancer n'ajoute rien.
 *
 * Choix de prudence :
 *  • Les 5 fichiers REX 2026 sont des copies quasi identiques ; on ne lit que
 *    le plus complet, et le dédoublonnage par identifiant protège du reste.
 *  • Une date incohérente avec son jour de semaine (mois mal saisi après
 *    duplication) est ÉCARTÉE et signalée — importer une date fausse
 *    contaminerait le calcul du temps de travail sans que personne ne le voie.
 *  • Un nom non rattaché à un agent connu est signalé, jamais deviné.
 *
 * Usage :
 *   npx tsx scripts/import-planning-rex.mts            # simulation
 *   npx tsx scripts/import-planning-rex.mts --apply
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { parserFeuilleRex, normaliserNom } = await import("../src/lib/planning/parseur-rex.ts");

const APPLY = process.argv.includes("--apply");
const D = "/Users/maxwilliamrafaliarison/Library/CloudStorage/OneDrive-Personnel/Documents/Centre REX/Planning/";
// Le plus récent et le plus complet des 6 fichiers REX (31 feuilles).
const FICHIER = "Planning REX_2707-0208.xlsx";

const U = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const K = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
const hdr = (schema: string) => ({ apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", "Accept-Profile": schema, "Content-Profile": schema });
async function pg(schema: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`${U}/rest/v1/${path}`, { method, headers: hdr(schema), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

// ── Référentiels ──────────────────────────────────────────────────────────
const agents: Array<{ id: string; nom: string; prenom: string; site: string }> =
  await pg("pointage", "GET", "agents?select=id,nom,prenom,site&limit=1000");
const services: Array<{ id: string; libelle: string }> =
  await pg("planning", "GET", "services?select=id,libelle&limit=200");

const parNomAgent = new Map<string, string>();
for (const a of agents) {
  const cle = normaliserNom(a.prenom);
  if (cle && !parNomAgent.has(cle)) parNomAgent.set(cle, a.id);
}
const parLibelleService = new Map<string, string>();
for (const s of services) parLibelleService.set(normaliserNom(s.libelle), s.id);

// ── Lecture ───────────────────────────────────────────────────────────────
const wb = XLSX.readFile(D + FICHIER);
const plannings = new Map<string, Record<string, unknown>>();
const affectations = new Map<string, Record<string, unknown>>();
const inconnus = new Map<string, number>();
const anomalies: string[] = [];
let joursEcartes = 0;

for (const nom of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, raw: false });
  const r = parserFeuilleRex(nom, rows);
  anomalies.push(...r.anomalies);
  if (r.jours.length === 0) continue;

  // Jours écartés : ceux dont la date contredit le jour de semaine annoncé.
  const suspects = new Set(
    r.anomalies.map((a) => /le (\d{4}-\d{2}-\d{2}) n'est pas/.exec(a)?.[1]).filter(Boolean) as string[],
  );
  joursEcartes += suspects.size;

  const jours = r.jours.filter((j) => !suspects.has(j)).sort();
  if (!jours.length) continue;

  const idPlanning = `PLN-REX-${jours[0].replace(/-/g, "")}`;
  plannings.set(idPlanning, {
    id: idPlanning,
    centre: "REX",
    du: jours[0],
    au: jours[jours.length - 1],
    libelle: `Planning REX du ${jours[0]} au ${jours[jours.length - 1]}`,
    statut: "archive",
    token_public: "",
    publie_par: "",
    publie_le: "",
    modifie_par: "import",
    modifie_le: new Date().toISOString(),
    note: `Repris de « ${FICHIER} », feuille « ${nom} »`,
  });

  for (const a of r.affectations) {
    if (suspects.has(a.jour)) continue;
    const serviceId = parLibelleService.get(normaliserNom(a.service)) ?? "";
    // Matin et après-midi : un agent cité aux deux fait une journée coupée.
    const tous = new Set([...a.matin, ...a.apresMidi]);
    for (const brut of tous) {
      const cle = normaliserNom(brut);
      const agentId = parNomAgent.get(cle);
      if (!agentId) {
        inconnus.set(brut, (inconnus.get(brut) ?? 0) + 1);
        continue;
      }
      const matin = a.matin.some((x) => normaliserNom(x) === cle);
      const aprem = a.apresMidi.some((x) => normaliserNom(x) === cle);
      // Créneau déduit de la présence matin / après-midi.
      const creneau = matin && aprem ? "std" : matin ? "matin" : "aprem";
      const id = `AFF-${idPlanning}-${a.jour.replace(/-/g, "")}-${agentId}-${serviceId || "x"}`;
      affectations.set(id, {
        id,
        planning_id: idPlanning,
        agent_id: agentId,
        jour: a.jour,
        creneau_id: creneau,
        service_id: serviceId,
        debut: "",
        fin: "",
        lieu: a.salle,
        note: serviceId ? "" : `Service non référencé : ${a.service}`,
      });
    }
  }
}

console.log(`${wb.SheetNames.length} feuilles lues`);
console.log(`  ${plannings.size} plannings · ${affectations.size} affectations`);
console.log(`  ${joursEcartes} jour(s) écarté(s) pour date incohérente · ${anomalies.length} anomalie(s)`);
console.log(`  ${inconnus.size} nom(s) non rattaché(s) à un agent connu`);
if (inconnus.size) {
  const top = [...inconnus].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log("    " + top.map(([n, c]) => `${n} (${c})`).join(" · "));
}
anomalies.slice(0, 4).forEach((a) => console.log("  ⚠ " + a));

if (!APPLY) {
  console.log("\n(simulation — relancez avec --apply)");
  process.exit(0);
}

// ── Écriture ──────────────────────────────────────────────────────────────
const dejaP: Array<{ id: string }> = await pg("planning", "GET", "plannings?select=id&limit=5000");
const idsP = new Set(dejaP.map((p) => p.id));
const nvP = [...plannings.values()].filter((p) => !idsP.has(p.id as string));
if (nvP.length) await pg("planning", "POST", "plannings", nvP);
console.log(`✅ ${nvP.length} plannings créés`);

const dejaA = new Set<string>();
for (let off = 0; ; off += 1000) {
  const page: Array<{ id: string }> = await pg("planning", "GET", `affectations?select=id&order=id.asc&limit=1000&offset=${off}`);
  page.forEach((r) => dejaA.add(r.id));
  if (page.length < 1000) break;
}
const nvA = [...affectations.values()].filter((a) => !dejaA.has(a.id as string));
for (let i = 0; i < nvA.length; i += 500) {
  await pg("planning", "POST", "affectations", nvA.slice(i, i + 500));
  process.stdout.write(`\r  affectations : ${Math.min(i + 500, nvA.length)}/${nvA.length}`);
}
console.log(`\n✅ ${nvA.length} affectations créées`);
