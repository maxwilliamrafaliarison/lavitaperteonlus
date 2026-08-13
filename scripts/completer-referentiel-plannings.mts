#!/usr/bin/env node
/**
 * COMPLÈTE LE RÉFÉRENTIEL avec les personnes citées aux plannings REX et
 * qui n'y figuraient pas. Arbitrages donnés par le responsable le 13 août.
 *
 * ── CE QUI EST UN ALIAS, ET NON UNE PERSONNE DE PLUS ─────────────────────
 * JIM est Onésime — prestataire des deux centres, déjà au référentiel sous
 * `AG-REX-16` avec 266 passages. Son statut est corrigé : il était noté
 * salarié.
 *
 * HERVÉ (UM) est le chauffeur des deux centres, déjà présent sous
 * `AG-REX-26`. Le planning le confirme : « Herve (UM) » n'apparaît que le
 * 14 août, seul jour de la quinzaine où « Herve » est absent — c'est la
 * même personne, notée autrement le jour où elle sort en unité mobile.
 *
 * ── CE QUI EST UNE PERSONNE DE PLUS ──────────────────────────────────────
 * EMMA (SIÈGE) travaille à REX et n'est PAS Emma RASOLOMAMPIONONA : les
 * deux figurent au planning LES MÊMES JOURS — 11, 12, 13 et 14 août. Deux
 * lignes du même jour ne peuvent pas désigner la même personne.
 *
 * PROF HAJA, DR MAHEFA et RS NORO sont des prestataires.
 *
 * Aucun d'eux n'est enrôlé sur une pointeuse : leur fiche est créée SANS
 * BADGE. Leurs heures ne seront pas mesurables tant qu'ils n'auront pas de
 * badge — mais leur planning, lui, les reconnaîtra.
 *
 * ── CE QUI N'ENTRE PAS ───────────────────────────────────────────────────
 * DIRICKS désigne des agents de sécurité extérieurs au centre. Ils tiennent
 * un poste tous les après-midi mais ne relèvent pas de sa paie : aucune
 * fiche, et l'import cesse de les signaler.
 *
 * Usage :
 *   npx tsx scripts/completer-referentiel-plannings.mts            # simulation
 *   npx tsx scripts/completer-referentiel-plannings.mts --apply
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const APPLY = process.argv.includes("--apply");

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
    h.Prefer = "return=representation";
  }
  return h;
};
async function lire<T>(path: string): Promise<T[]> {
  const r = await fetch(`${U}/rest/v1/${path}`, { headers: H() });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.json();
}
async function ecrire(path: string, body: unknown, methode = "PATCH") {
  const r = await fetch(`${U}/rest/v1/${path}`, { method: methode, headers: H(true), body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${methode} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : [];
}

/* Identifiants NON numériques à dessein : le suffixe d'une fiche agent est
   ailleurs un numéro de pointeuse. Ces personnes n'en ont pas, et rien ne
   doit laisser croire le contraire. */
const NOUVEAUX = [
  { id: "AG-REX-EMMASIEGE", prenom: "Emma (siège)", nom: "", site: "REX", statut: "salarie", poste: "" },
  { id: "AG-REX-HAJA", prenom: "Haja", nom: "", site: "REX", statut: "prestataire", poste: "Gynécologie" },
  { id: "AG-REX-MAHEFA", prenom: "Mahefa", nom: "", site: "REX", statut: "prestataire", poste: "Gynécologie" },
  { id: "AG-REX-NORO", prenom: "Noro", nom: "", site: "REX", statut: "prestataire", poste: "CPN" },
];

const existants = await lire<{ id: string; prenom: string; nom: string; statut: string }>(
  "agents?select=id,prenom,nom,statut&limit=300",
);
const connus = new Set(existants.map((a) => a.id));
const aCreer = NOUVEAUX.filter((n) => !connus.has(n.id));
const onesime = existants.find((a) => a.id === "AG-REX-16");

console.log(`${aCreer.length} fiche(s) à créer, sans badge :`);
for (const n of aCreer) console.log(`   ${n.id.padEnd(20)} ${n.prenom.padEnd(14)} ${n.statut}${n.poste ? ` · ${n.poste}` : ""}`);
console.log(
  `\nOnésime (AG-REX-16, alias « Jim ») : statut « ${onesime?.statut} »` +
    (onesime?.statut === "prestataire" ? " — déjà correct" : " → prestataire"),
);

if (!APPLY) {
  console.log("\n(simulation — relancez avec --apply)");
  process.exit(0);
}

const now = new Date().toISOString();
if (aCreer.length) {
  await ecrire(
    "agents",
    aCreer.map((n) => ({
      ...n,
      service: "",
      horaire_id: "std",
      taux_horaire: 0,
      actif: true,
      createdat: now,
    })),
    "POST",
  );
  console.log(`✅ ${aCreer.length} fiche(s) créée(s)`);
}
if (onesime && onesime.statut !== "prestataire") {
  await ecrire("agents?id=eq.AG-REX-16", { statut: "prestataire" });
  console.log("✅ Onésime passé en prestataire");
}

const apres = await lire<{ id: string }>("agents?select=id&actif=is.true&limit=300");
console.log(`Vérification : ${apres.length} fiches actives au référentiel.`);
