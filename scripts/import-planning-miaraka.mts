#!/usr/bin/env node
/**
 * REPRISE DES PLANNINGS MIARAKA (feuilles mensuelles, matrice agents × jours).
 *
 * Un planning par feuille-mois, une affectation par (agent, jour).
 * Idempotent : identifiants déterministes.
 *
 * Les horaires sont portés par l'AFFECTATION (champs debut/fin) plutôt que
 * par un modèle de créneau : MIARAKA emploie des dizaines de combinaisons
 * horaires, souvent propres à un agent et à une semaine. Les figer en
 * catalogue obligerait à créer un modèle par variante ; les stocker sur
 * l'affectation reste fidèle au fichier d'origine, et le moteur sait déjà
 * qu'un horaire dérogatoire prime sur son modèle.
 *
 * Usage :
 *   npx tsx scripts/import-planning-miaraka.mts            # simulation
 *   npx tsx scripts/import-planning-miaraka.mts --apply
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { parserFeuilleMiaraka } = await import("../src/lib/planning/parseur-miaraka.ts");
const { normaliserNom } = await import("../src/lib/planning/parseur-rex.ts");
const { traverseMinuit } = await import("../src/lib/planning/creneau.ts");

const APPLY = process.argv.includes("--apply");
const D = "/Users/maxwilliamrafaliarison/Library/CloudStorage/OneDrive-Personnel/Documents/Centre REX/Planning/";
const FICHIER = "Planning Miaraka 2026_AOUT 26.xlsx";

const U = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const K = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
const hdr = (s: string) => ({ apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", "Accept-Profile": s, "Content-Profile": s });
async function pg(schema: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`${U}/rest/v1/${path}`, { method, headers: hdr(schema), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

// ── Référentiel des agents ────────────────────────────────────────────────
const agents: Array<{ id: string; nom: string; prenom: string; site: string }> =
  await pg("pointage", "GET", "agents?select=id,nom,prenom,site&limit=1000");
// On privilégie les agents rattachés à MIARAKA : les prénoms se répètent
// entre les deux centres (Emma, Herve, Maurice…) et un rapprochement
// indifférencié attribuerait les heures à la mauvaise personne.
const parNom = new Map<string, string>();
for (const a of [...agents].sort((x, y) => (x.site === "MIARAKA" ? -1 : 1))) {
  const cle = normaliserNom(a.prenom);
  if (cle && !parNom.has(cle)) parNom.set(cle, a.id);
}

// Abréviations employées dans les en-têtes de colonnes du planning, qui ne
// correspondent à aucun prénom du référentiel. « J.CLAUDE » représente à lui
// seul 473 affectations : le laisser de côté amputerait le planning d'un
// agent à temps plein.
const ALIAS: Record<string, string> = {
  "j claude": "jeanclaude",
  "jean claude": "jeanclaude",
  "j.claude": "jeanclaude",
  toma: "tome",
};
const resoudre = (nom: string): string | undefined => {
  const cle = normaliserNom(nom);
  return parNom.get(cle) ?? parNom.get(ALIAS[cle] ?? "");
};

// ── Lecture ───────────────────────────────────────────────────────────────
const wb = XLSX.readFile(D + FICHIER);
const plannings = new Map<string, Record<string, unknown>>();
const affectations = new Map<string, Record<string, unknown>>();
const inconnus = new Map<string, number>();
let anomalies = 0;
let nonReconnues = 0;

for (const nomFeuille of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomFeuille], { header: 1, raw: false });
  const r = parserFeuilleMiaraka(nomFeuille, rows);
  anomalies += r.anomalies.length;
  if (r.jours.length === 0) continue;

  const jours = [...r.jours].sort();
  const idPlanning = `PLN-MIARAKA-${jours[0].replace(/-/g, "")}`;
  plannings.set(idPlanning, {
    id: idPlanning,
    centre: "MIARAKA",
    du: jours[0],
    au: jours[jours.length - 1],
    libelle: `Planning MIARAKA du ${jours[0]} au ${jours[jours.length - 1]}`,
    statut: "archive",
    token_public: "",
    publie_par: "",
    publie_le: "",
    modifie_par: "import",
    modifie_le: new Date().toISOString(),
    note: `Repris de « ${FICHIER} », feuille « ${nomFeuille} »`,
  });

  for (const a of r.affectations) {
    const agentId = resoudre(a.agent);
    if (!agentId) {
      inconnus.set(a.agent, (inconnus.get(a.agent) ?? 0) + 1);
      continue;
    }
    if (!a.reconnu) {
      nonReconnues++;
      continue; // écriture non comprise : on ne devine pas d'horaire.
    }

    const p0 = a.plages[0];
    // Le créneau donne le TYPE ; les bornes exactes vivent sur l'affectation.
    const creneauId = a.repos
      ? "repos"
      : a.plages.length >= 2
        ? "j_7_17"
        : p0 && traverseMinuit(p0.debut, p0.fin)
          ? "g_11_8"
          : "sec_jour";

    const id = `AFF-${idPlanning}-${a.jour.replace(/-/g, "")}-${agentId}`;
    affectations.set(id, {
      id,
      planning_id: idPlanning,
      agent_id: agentId,
      jour: a.jour,
      creneau_id: creneauId,
      service_id: "",
      debut: p0?.debut ?? "",
      fin: a.plages.length >= 2 ? a.plages[a.plages.length - 1].fin : (p0?.fin ?? ""),
      lieu: a.lieu,
      note: a.ecriture.replace(/\n/g, " / ").slice(0, 120),
    });
  }
}

console.log(`${wb.SheetNames.length} feuilles lues`);
console.log(`  ${plannings.size} plannings · ${affectations.size} affectations`);
console.log(`  ${anomalies} date(s) écartée(s) · ${nonReconnues} écriture(s) non comprise(s)`);
console.log(`  ${inconnus.size} agent(s) non rattaché(s)`);
if (inconnus.size) {
  console.log("    " + [...inconnus].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, c]) => `${n} (${c})`).join(" · "));
}

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
  page.forEach((x) => dejaA.add(x.id));
  if (page.length < 1000) break;
}
const nvA = [...affectations.values()].filter((a) => !dejaA.has(a.id as string));
for (let i = 0; i < nvA.length; i += 500) {
  await pg("planning", "POST", "affectations", nvA.slice(i, i + 500));
  process.stdout.write(`\r  affectations : ${Math.min(i + 500, nvA.length)}/${nvA.length}`);
}
console.log(`\n✅ ${nvA.length} affectations créées`);
