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
const { resoudreAgent, HORS_REFERENTIEL, normaliserUsuel } = await import("../src/lib/pointage/alias.ts");

const APPLY = process.argv.includes("--apply");
const arg = (nom: string) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);
const CHEMIN = arg("fichier");
const D = CHEMIN
  ? CHEMIN.slice(0, CHEMIN.lastIndexOf("/") + 1)
  : "/Users/maxwilliamrafaliarison/Library/CloudStorage/OneDrive-Personnel/Documents/Centre REX/Planning/";
const FICHIER = CHEMIN ? CHEMIN.slice(CHEMIN.lastIndexOf("/") + 1) : "Planning Miaraka 2026_AOUT 26.xlsx";
const STATUT = arg("statut") ?? "archive";

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
/* On passe TOUTES les fiches, archivées comprises : le module d'alias en a
   besoin pour suivre une fiche absorbée jusqu'à celle qui l'a remplacée. */
const agents: Array<{ id: string; nom: string; prenom: string; site: string; actif: boolean }> =
  await pg("pointage", "GET", "agents?select=id,nom,prenom,site,actif&limit=1000");
/* La résolution des noms usuels est CENTRALISÉE dans
   `src/lib/pointage/alias.ts`. Elle porte les arbitrages vérifiés sur les
   données : « Isabelle » désigne la médecin généraliste à MIARAKA et une
   collaboratrice à REX, « Lalao » est la FIN de « TINALALAO » et aucune
   règle mécanique ne la trouve, « J.CLAUDE » à lui seul porte 473
   affectations. Un nom qui répond pour plusieurs agents n'est pas tranché :
   il est signalé, et la RH arbitre. */
const ambigus = new Map<string, string[]>();
const cacheNom = new Map<string, string | undefined>();
const resoudre = (nom: string): string | undefined => {
  if (cacheNom.has(nom)) return cacheNom.get(nom);
  const r = resoudreAgent(nom, agents, "MIARAKA");
  if (r.voie === "ambigu") ambigus.set(nom, r.candidats ?? []);
  const id = r.agentId ?? undefined;
  cacheNom.set(nom, id);
  return id;
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
    statut: STATUT,
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
const exterieurs = [...inconnus].filter(([n]) => HORS_REFERENTIEL.has(normaliserUsuel(n)));
for (const [n] of exterieurs) inconnus.delete(n);
if (exterieurs.length) console.log(`  ${exterieurs.length} nom(s) hors référentiel par décision`);
console.log(`  ${inconnus.size} agent(s) non rattaché(s)`);
if (ambigus.size) {
  console.log(`  ⚠ ${ambigus.size} nom(s) AMBIGU(S) — à trancher avant import :`);
  for (const [n, c] of ambigus) console.log(`      « ${n} » → ${c.join("  |  ")}`);
}
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

/* Deux garde-fous, et non un seul. L'identifiant protège du doublon exact ;
   la CLÉ MÉTIER (planning, agent, jour, service) protège du doublon
   déguisé — celui qu'a créé la fusion des fiches, où une affectation
   importée jadis sous « AG-MIARAKA-23 » occupe désormais la place de
   « AG-REX-40 » sous un identifiant différent. Sans ce second filtre,
   l'import s'arrête sur une violation de contrainte à mi-course. */
const dejaA = new Set<string>();
const dejaCle = new Set<string>();
for (let off = 0; ; off += 1000) {
  const page: Array<{ id: string; planning_id: string; agent_id: string; jour: string; service_id: string }> =
    await pg("planning", "GET", `affectations?select=id,planning_id,agent_id,jour,service_id&order=id.asc&limit=1000&offset=${off}`);
  for (const x of page) {
    dejaA.add(x.id);
    dejaCle.add(`${x.planning_id}|${x.agent_id}|${x.jour}|${x.service_id}`);
  }
  if (page.length < 1000) break;
}
const cleMetier = (a: Record<string, unknown>) =>
  `${a.planning_id}|${a.agent_id}|${a.jour}|${a.service_id}`;
const nvA = [...affectations.values()].filter(
  (a) => !dejaA.has(a.id as string) && !dejaCle.has(cleMetier(a)),
);
const ecartes = affectations.size - nvA.length;
for (let i = 0; i < nvA.length; i += 500) {
  await pg("planning", "POST", "affectations", nvA.slice(i, i + 500));
  process.stdout.write(`\r  affectations : ${Math.min(i + 500, nvA.length)}/${nvA.length}`);
}
console.log(`\n✅ ${nvA.length} affectations créées · ${ecartes} déjà présentes`);
