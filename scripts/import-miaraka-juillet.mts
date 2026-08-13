#!/usr/bin/env node
/**
 * IMPORT DU BRUT MIARAKA — juillet 2026.
 *
 * MIARAKA n'a pas de collecteur réseau : sa pointeuse n'est pas jointe par le
 * poste d'Aina, et ses badgeages n'arrivent que par un export déposé à la
 * main. La base était muette depuis le 27 juillet ; ce fichier comble le mois.
 *
 * Idempotent : chaque pointage porte un identifiant déterministe (installation
 * + id pointeuse + horodatage), relancer n'ajoute rien. L'import est TRACÉ dans
 * `pointage.imports` — un dépôt manuel doit laisser la même trace qu'une
 * collecte automatique, sinon l'origine d'une donnée devient invérifiable.
 *
 * ⚠️ Chaque installation numérote SES agents : le « Personnel ID » 14 de
 * MIARAKA n'est pas celui de REX. L'installation vient du FICHIER, jamais du
 * champ Device Name.
 *
 * Usage :
 *   npx tsx scripts/import-miaraka-juillet.mts            # simulation
 *   npx tsx scripts/import-miaraka-juillet.mts --apply
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { parserClasseur, idPointage } = await import("../src/lib/pointage/parseur.ts");

const APPLY = process.argv.includes("--apply");
const FICHIER =
  process.argv.find((a) => a.endsWith(".xls") || a.endsWith(".xlsx")) ??
  "/Users/maxwilliamrafaliarison/Downloads/Miaraka_Pointage BRUT Juillet 2026.xls";
const INSTALLATION = "MIARAKA";

const URL_SB = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "")
  .trim()
  .replace(/\/+$/, "");
const KEY = (
  process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || ""
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

// ── Lecture ───────────────────────────────────────────────────────────────
const wb = XLSX.readFile(FICHIER);
const feuilles: Array<[string, unknown[][]]> = wb.SheetNames.map((n: string) => [
  n,
  XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true }),
]);
const parse = parserClasseur(feuilles);

console.log(`${FICHIER.split("/").pop()}`);
console.log(
  `  ${parse.lignesLues} lignes lues → ${parse.pointages.length} retenus ` +
    `(doublons ${parse.ignoreesDoublons}, parasites ${parse.ignoreesParasites})`,
);
for (const a of parse.anomalies.slice(0, 10)) console.log(`  ⚠ ${a}`);

const jours = [...new Set(parse.pointages.map((p) => p.jour))].sort();
console.log(`  période : ${jours[0]} → ${jours.at(-1)}  (${jours.length} jours couverts)`);

/* Un jour sans le moindre badgeage sur un site ouvert n'est pas anodin :
   c'est soit un jour chômé, soit un trou de collecte. On les nomme. */
const manquants: string[] = [];
for (let d = new Date(`${jours[0]}T00:00:00Z`); d <= new Date(`${jours.at(-1)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
  const j = d.toISOString().slice(0, 10);
  if (!jours.includes(j)) manquants.push(j);
}
if (manquants.length) console.log(`  jours sans aucun badgeage : ${manquants.join(", ")}`);

// ── Rapprochement au référentiel ──────────────────────────────────────────
const agentsBase: Array<{ id: string; prenom: string; nom: string; site: string; actif: boolean }> =
  await pg("GET", "agents?select=id,prenom,nom,site,actif&limit=5000");
const parIdAgent = new Map(agentsBase.map((a) => [a.id, a]));

const vus = new Map<string, { prenom: string; n: number }>();
for (const p of parse.pointages) {
  const e = vus.get(p.idPointeuse) ?? { prenom: p.prenom, n: 0 };
  e.n++;
  if (!e.prenom && p.prenom) e.prenom = p.prenom;
  vus.set(p.idPointeuse, e);
}

console.log(`\n  ${vus.size} personnes dans le fichier :`);
const aCreer: Array<{ idPointeuse: string; prenom: string }> = [];
for (const [id, { prenom, n }] of [...vus.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const agentId = `AG-${INSTALLATION}-${id}`;
  const connu = parIdAgent.get(agentId);
  const etat = connu
    ? `${(connu.prenom + " " + connu.nom).trim() || "sans nom"}${connu.actif ? "" : " (inactif)"}`
    : "⚠ INCONNU AU RÉFÉRENTIEL";
  if (!connu) aCreer.push({ idPointeuse: id, prenom });
  console.log(`    ${id.padStart(3)} ${prenom.padEnd(14)} ${String(n).padStart(4)} passages   ${etat}`);
}

// ── Ce qui manque réellement en base ──────────────────────────────────────
const maintenant = new Date().toISOString();
const lignes = parse.pointages.map((p) => ({
  id: idPointage(p, INSTALLATION),
  agent_id: `AG-${INSTALLATION}-${p.idPointeuse}`,
  site_pointage: p.appareil || INSTALLATION,
  horodatage: p.horodatage,
  jour: p.jour,
  sens_brut: p.sensBrut,
  verif: p.verif,
  appareil: p.appareil,
  source: "import",
  importe_le: maintenant,
}));

const connus = new Set<string>();
for (let off = 0; ; off += 1000) {
  const page: Array<{ id: string }> = await pg(
    "GET",
    `pointages?select=id&order=id.asc&limit=1000&offset=${off}`,
  );
  page.forEach((r) => connus.add(r.id));
  if (page.length < 1000) break;
}
const aInserer = lignes.filter((l) => !connus.has(l.id));
const parJour = new Map<string, number>();
for (const l of aInserer) parJour.set(l.jour, (parJour.get(l.jour) ?? 0) + 1);

console.log(
  `\n  ${aInserer.length} nouveaux pointages · ${lignes.length - aInserer.length} déjà en base`,
);
if (parJour.size) {
  console.log("  répartition des nouveaux :");
  for (const [j, n] of [...parJour.entries()].sort()) console.log(`    ${j}  ${"▪".repeat(Math.min(n, 40))} ${n}`);
}

if (!APPLY) {
  console.log("\n(simulation — relancez avec --apply)");
  process.exit(0);
}

// ── Écriture ──────────────────────────────────────────────────────────────
if (aCreer.length) {
  await pg(
    "POST",
    "agents",
    aCreer.map((a) => ({
      id: `AG-${INSTALLATION}-${a.idPointeuse}`,
      nom: "",
      prenom: a.prenom || `Agent ${a.idPointeuse}`,
      site: INSTALLATION,
      statut: "salarie",
      poste: "",
      service: "",
      horaire_id: "std",
      taux_horaire: 0,
      actif: true,
      createdat: maintenant,
    })),
  );
  await pg(
    "POST",
    "badges",
    aCreer.map((a) => ({
      id: `BDG-${INSTALLATION}-${a.idPointeuse}`,
      agent_id: `AG-${INSTALLATION}-${a.idPointeuse}`,
      installation: INSTALLATION,
      id_pointeuse: a.idPointeuse,
      valide_du: "",
      valide_au: "",
      note: "Créé par l'import du brut MIARAKA juillet 2026",
    })),
  );
  console.log(`✅ ${aCreer.length} agent(s) et badge(s) créés`);
}

for (let i = 0; i < aInserer.length; i += 500) {
  await pg("POST", "pointages", aInserer.slice(i, i + 500));
}
console.log(`✅ ${aInserer.length} pointages insérés`);

await pg("POST", "imports", [
  {
    id: `IMP-MIARAKA-JUIL2026-${maintenant.slice(0, 19).replace(/[-:T]/g, "")}`,
    site: INSTALLATION,
    fichier: FICHIER.split("/").pop() ?? "",
    lignes_lues: parse.lignesLues,
    lignes_creees: aInserer.length,
    lignes_ignorees: lignes.length - aInserer.length,
    anomalies: parse.anomalies.slice(0, 5).join(" · "),
    auteur_email: "informatique.lavitaperte@gmail.com",
    timestamp: maintenant,
  },
]);

const r = await fetch(`${URL_SB}/rest/v1/pointages?select=id&limit=1`, {
  method: "HEAD",
  headers: { ...H, Prefer: "count=exact" },
});
console.log(`Vérification : ${(r.headers.get("content-range") ?? "?").split("/")[1]} pointages en base.`);
