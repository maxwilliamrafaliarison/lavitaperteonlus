#!/usr/bin/env node
/**
 * CORRECTIONS DE LA DRH sur le référentiel du personnel — 13 août 2026.
 *
 * Aina a relu la liste des soixante agents et l'a rectifiée. Ce fichier
 * applique ses corrections : elle est la source d'autorité sur l'identité,
 * le poste et le statut des gens du centre, et le référentiel doit dire ce
 * qu'elle dit.
 *
 * ── CE QU'ELLE APPORTE, ET QUE PERSONNE D'AUTRE NE POUVAIT DONNER ────────
 * LES NOMS D'ÉTAT CIVIL. Dix personnes n'existaient dans le système que
 * sous un surnom de pointeuse — « Onesime », « Sfemma », « Germainchauf ».
 * Aucune donnée ne permettait de les nommer : il fallait quelqu'un qui les
 * connaisse.
 *
 * LE STATUT. Quatorze personnes étaient notées salariées alors qu'elles
 * sont prestataires. Ce n'est pas cosmétique : un prestataire n'a ni
 * planning opposable, ni retard, ni congés — on paie un volume d'heures.
 * Les compter comme salariés fausse l'état mensuel autant que la paie.
 *
 * LE DOUBLE SITE. Elle écrit « MIARAKA/REX » pour neuf personnes, et c'est
 * exactement la réalité que les badgeages avaient révélée : le lieu du
 * badge ne dit pas le lieu du travail. Le champ le portait déjà comme du
 * texte libre ; c'est le CODE qui n'y était pas prêt (voir plus bas).
 *
 * ── LE DÉCOUPAGE PRÉNOM / NOM ────────────────────────────────────────────
 * Sa colonne donne le nom complet d'un seul tenant, quand la base sépare
 * prénom et patronyme. La coupure suit l'usage malgache tel qu'elle
 * l'écrit : les MAJUSCULES de fin marquent le patronyme. Faute de
 * majuscules, tout reste en prénom — mieux vaut un champ trop plein qu'une
 * coupure inventée au mauvais endroit.
 *
 * Usage :
 *   npx tsx scripts/corrections-drh-aout.mts            # simulation
 *   npx tsx scripts/corrections-drh-aout.mts --apply
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const APPLY = process.argv.includes("--apply");
const FICHIER =
  process.argv.find((a) => a.endsWith(".xlsx")) ??
  "/Users/maxwilliamrafaliarison/Downloads/Personnel REX-MIARAKA (2).xlsx";

const U = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const K = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(
  /[^A-Za-z0-9._-]/g,
  "",
);
const H = (ecrit = false) => {
  const h: Record<string, string> = { apikey: K, Authorization: `Bearer ${K}`, "Accept-Profile": "pointage" };
  if (ecrit) {
    h["Content-Type"] = "application/json";
    h["Content-Profile"] = "pointage";
    h.Prefer = "return=minimal";
  }
  return h;
};
async function lire<T>(path: string): Promise<T[]> {
  const r = await fetch(`${U}/rest/v1/${path}`, { headers: H() });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.json();
}
async function ecrire(path: string, body: unknown) {
  const r = await fetch(`${U}/rest/v1/${path}`, { method: "PATCH", headers: H(true), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
}

const norm = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Découpe « Sylvano Onésime RAKOTONDRAVELO » en prénom + patronyme. */
function decouper(complet: string): { prenom: string; nom: string } {
  const mots = complet.trim().split(/\s+/);
  const capitales: string[] = [];
  for (let i = mots.length - 1; i >= 0; i--) {
    const m = mots[i];
    // Un mot tout en majuscules, d'au moins trois lettres, est un patronyme.
    if (m.length >= 3 && m === m.toUpperCase() && /[A-ZÀ-Ý]/.test(m)) capitales.unshift(m);
    else break;
  }
  if (!capitales.length || capitales.length === mots.length) return { prenom: complet.trim(), nom: "" };
  return { prenom: mots.slice(0, mots.length - capitales.length).join(" "), nom: capitales.join(" ") };
}

/** Les trois personnes sans badge, rapprochées sur leur nom usuel. */
const SANS_BADGE: Record<string, string> = {
  hajanirina: "AG-REX-HAJA",
  mahefa: "AG-REX-MAHEFA",
  noro: "AG-REX-NORO",
};

// ── Lecture ───────────────────────────────────────────────────────────────
const wb = XLSX.readFile(FICHIER);
const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["Personnel"], { header: 1, defval: "" });
const lignes = rows
  .slice(4)
  .filter((r) => String(r[0] ?? "").trim())
  .map((r) => ({
    complet: String(r[0]).trim(),
    usuel: String(r[1] ?? "").trim(),
    centre: String(r[2] ?? "").trim().toUpperCase(),
    statut: /prestataire/i.test(String(r[3] ?? "")) ? "prestataire" : "salarie",
    poste: String(r[4] ?? "").trim(),
    badges: String(r[6] ?? "").trim(),
  }));

const agents = await lire<{ id: string; prenom: string; nom: string; site: string; statut: string; poste: string }>(
  "agents?select=id,prenom,nom,site,statut,poste&limit=300",
);
const parId = new Map(agents.map((a) => [a.id, a]));
const badges = await lire<{ agent_id: string; installation: string; id_pointeuse: string }>(
  "badges?select=agent_id,installation,id_pointeuse&limit=300",
);
const parBadge = new Map(badges.map((b) => [`${b.installation}-${b.id_pointeuse}`, b.agent_id]));

interface Correction { id: string; champ: string; avant: string; apres: string }
const corrections: Correction[] = [];
const orphelines: string[] = [];

for (const l of lignes) {
  /* Le BADGE est la clé la plus sûre — un nom se réécrit, un numéro de
     pointeuse non. Les trois personnes sans badge se rattachent par leur
     nom usuel, arbitré. */
  const ids = new Set(
    l.badges.split("+").map((x) => parBadge.get(x.trim())).filter(Boolean) as string[],
  );
  let id = ids.size === 1 ? [...ids][0] : "";
  if (!id) {
    const cle = Object.keys(SANS_BADGE).find((k) => norm(l.complet).includes(k));
    id = cle ? SANS_BADGE[cle] : "";
  }
  const a = id ? parId.get(id) : undefined;
  if (!a) {
    orphelines.push(l.complet);
    continue;
  }

  const { prenom, nom } = decouper(l.complet);
  const avantNom = `${a.prenom} ${a.nom}`.trim();
  if (norm(avantNom) !== norm(l.complet)) corrections.push({ id, champ: "nom", avant: avantNom, apres: `${prenom} | ${nom}` });
  if (norm(a.site) !== norm(l.centre) && l.centre) corrections.push({ id, champ: "site", avant: a.site, apres: l.centre });
  if (a.statut !== l.statut) corrections.push({ id, champ: "statut", avant: a.statut, apres: l.statut });
  if (norm(a.poste) !== norm(l.poste) && l.poste) corrections.push({ id, champ: "poste", avant: a.poste || "—", apres: l.poste });
}

console.log(`${lignes.length} lignes relues par la DRH · ${corrections.length} correction(s)\n`);
for (const c of corrections) {
  const a = parId.get(c.id)!;
  console.log(
    `  ${c.id.padEnd(16)} ${c.champ.padEnd(7)} ${`${a.prenom} ${a.nom}`.trim().slice(0, 24).padEnd(26)} « ${c.avant.slice(0, 30)} » → « ${c.apres.slice(0, 38)} »`,
  );
}
if (orphelines.length) console.log(`\n⚠ ${orphelines.length} ligne(s) non rattachée(s) : ${orphelines.join(" · ")}`);

if (!APPLY) {
  console.log("\n(simulation — relancez avec --apply)");
  process.exit(0);
}

// ── Application, un agent à la fois ───────────────────────────────────────
const parAgent = new Map<string, Record<string, string>>();
for (const l of lignes) {
  const ids = new Set(l.badges.split("+").map((x) => parBadge.get(x.trim())).filter(Boolean) as string[]);
  let id = ids.size === 1 ? [...ids][0] : "";
  if (!id) {
    const cle = Object.keys(SANS_BADGE).find((k) => norm(l.complet).includes(k));
    id = cle ? SANS_BADGE[cle] : "";
  }
  if (!id || !parId.has(id)) continue;
  const { prenom, nom } = decouper(l.complet);
  parAgent.set(id, {
    prenom,
    nom,
    ...(l.centre ? { site: l.centre } : {}),
    statut: l.statut,
    ...(l.poste ? { poste: l.poste } : {}),
  });
}
for (const [id, patch] of parAgent) await ecrire(`agents?id=eq.${id}`, patch);
console.log(`✅ ${parAgent.size} fiche(s) mise(s) à jour`);

const apres = await lire<{ id: string; prenom: string; nom: string; site: string; statut: string }>(
  "agents?select=id,prenom,nom,site,statut&actif=is.true&limit=300",
);
const multi = apres.filter((a) => a.site.includes("/"));
console.log(
  `Vérification : ${apres.length} fiches actives · ${apres.filter((a) => a.statut === "prestataire").length} prestataires · ${multi.length} sur deux sites`,
);
for (const a of multi) console.log(`   ${a.site.padEnd(13)} ${`${a.prenom} ${a.nom}`.trim()}`);
