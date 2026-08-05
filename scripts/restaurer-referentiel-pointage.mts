#!/usr/bin/env node
/**
 * RESTAURATION DU RÉFÉRENTIEL DE POINTAGE (agents + badges).
 *
 * ── POURQUOI CE SCRIPT EXISTE ────────────────────────────────────────────
 * Les tables `agents` et `badges` ont été vidées par une suppression dont le
 * filtre — un opérateur `not.match` qui n'existe pas dans PostgREST — a été
 * ignoré : la requête a porté sur toute la table au lieu des seules lignes
 * corrompues. Les 14 393 pointages, eux, sont intacts.
 *
 * Ce script reconstitue le référentiel à partir des sources de vérité, sans
 * toucher aux pointages :
 *   1. les identifiants réellement utilisés, lus dans les pointages ;
 *   2. les prénoms usuels, lus dans la mémoire de la pointeuse REX ;
 *   3. les noms complets, postes et services, lus dans le classeur
 *      « Info employés » tenu par l'administration ;
 *   4. la qualité de prestataire, lue dans l'onglet « Suivi contrat
 *      Prestataires » du même classeur — elle commande la règle LIM.
 *
 * Le rapprochement se fait sur le PRÉNOM USUEL, jamais sur l'identifiant :
 * celui du classeur n'est pas à jour (il donne 15 pour Herinome quand la
 * pointeuse REX attribue 15 à Aina), tandis que le prénom usuel est
 * précisément ce que les deux systèmes ont en commun.
 *
 * Usage :
 *   npx tsx scripts/restaurer-referentiel-pointage.mts            (lecture seule)
 *   npx tsx scripts/restaurer-referentiel-pointage.mts --apply
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import "./lib/zk-correctif.mjs";

const require = createRequire(import.meta.url);
const ZKLib = require("node-zklib");
const XLSX = require("xlsx");

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const APPLY = process.argv.includes("--apply");
const IP_REX = "192.168.8.21";
const CLASSEUR = "/Users/maxwilliamrafaliarison/Downloads/Info employés - juillet 2025.xlsx";
const PERSONNEL_MIARAKA = "/Users/maxwilliamrafaliarison/Downloads/Personnel_20250617163011.xls";

const U = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const K = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", "Accept-Profile": "pointage", "Content-Profile": "pointage" };
async function pg(method: string, path: string, body?: unknown) {
  // « merge-duplicates » rend l'écriture rejouable : relancer la restauration
  // met à jour les lignes existantes au lieu d'échouer sur la première clé
  // déjà connue — indispensable pour un script de reprise.
  const entetes = method === "POST" ? { ...H, Prefer: "resolution=merge-duplicates" } : H;
  const r = await fetch(`${U}/rest/v1/${path}`, { method, headers: entetes, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

/** Comparaison de prénoms : sans accents, sans casse, sans titre « Dr ». */
function cle(s: string): string {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^\s*(dr|mme|mr|m)\.?\s+/i, "")
    .trim()
    .toLowerCase();
}

// ── 1. Identifiants réellement utilisés ───────────────────────────────────
// Pagination obligatoire : PostgREST plafonne CHAQUE réponse à 1000 lignes,
// quelle que soit la limite demandée. Sans cela, on ne verrait qu'une part
// des agents et la restauration serait muette sur les autres.
const utilises = new Map<string, string>();
for (let off = 0; ; off += 1000) {
  const p: Array<{ agent_id: string; site_pointage: string }> = await pg(
    "GET",
    `pointages?select=agent_id,site_pointage&order=id&limit=1000&offset=${off}`,
  );
  if (!p.length) break;
  for (const x of p) utilises.set(x.agent_id, x.site_pointage);
}
console.log(`${utilises.size} agents référencés par les pointages.`);

// ── 2. Prénoms usuels par identifiant de pointeuse ────────────────────────
const prenomParId: Record<string, Record<string, string>> = { REX: {}, MIARAKA: {} };

const zk = new ZKLib(IP_REX, 4370, 60000, 8000);
try {
  await zk.createSocket();
  const us = await zk.getUsers().catch(() => null);
  for (const u of us?.data ?? []) {
    const id = String(u.userId ?? u.uid ?? "").trim();
    if (id) prenomParId.REX[id] = String(u.name ?? "").trim();
  }
  console.log(`${Object.keys(prenomParId.REX).length} prénoms lus sur la pointeuse REX.`);
} catch {
  console.log("Pointeuse REX injoignable — les prénoms REX viendront du classeur seul.");
} finally {
  await zk.disconnect().catch(() => {});
}

try {
  const wbP = XLSX.readFile(PERSONNEL_MIARAKA);
  const rows: string[][] = XLSX.utils.sheet_to_json(wbP.Sheets[wbP.SheetNames[0]], { header: 1, defval: "" });
  for (const r of rows.slice(1)) {
    const id = String(r[0] ?? "").trim();
    const prenom = String(r[1] ?? "").trim();
    if (id && prenom) prenomParId.MIARAKA[id] = prenom;
  }
  console.log(`${Object.keys(prenomParId.MIARAKA).length} prénoms lus dans l'export MIARAKA.`);
} catch {
  console.log("Export Personnel MIARAKA illisible — prénoms MIARAKA indisponibles.");
}

// ── 3. Noms complets, postes, services ────────────────────────────────────
interface Fiche { nom: string; prenoms: string; poste: string; service: string; lieu: string }
const fiches = new Map<string, Fiche>();
const wb = XLSX.readFile(CLASSEUR);
const emp: string[][] = XLSX.utils.sheet_to_json(wb.Sheets["1"], { header: 1, defval: "" });
for (const r of emp) {
  const usuel = String(r[1] ?? "").trim();
  const nom = String(r[2] ?? "").trim();
  if (!usuel || !nom || nom === "Nom") continue;
  fiches.set(cle(usuel), {
    nom,
    prenoms: String(r[3] ?? "").trim(),
    service: String(r[6] ?? "").trim(),
    poste: String(r[7] ?? "").trim(),
    lieu: String(r[8] ?? "").trim(),
  });
}
console.log(`${fiches.size} fiches nominatives lues dans le classeur.`);

// ── 4. Prestataires (règle LIM) ───────────────────────────────────────────
const prestataires = new Set<string>();
const pr: string[][] = XLSX.utils.sheet_to_json(wb.Sheets["Suivi contrat Prestataires2024"], { header: 1, defval: "" });
for (const r of pr) {
  const nomComplet = String(r[0] ?? "").trim();
  const usuel = String(r[1] ?? "").trim();
  if (!usuel || usuel === "Prenom usuel") continue;
  prestataires.add(cle(usuel));
  if (nomComplet && !fiches.has(cle(usuel))) {
    const morceaux = nomComplet.split(/\s+/);
    fiches.set(cle(usuel), {
      nom: morceaux[0] ?? nomComplet,
      prenoms: morceaux.slice(1).join(" "),
      service: "",
      poste: String(r[3] ?? "").trim(),
      lieu: String(r[2] ?? "").trim(),
    });
  }
}
console.log(`${prestataires.size} prestataires identifiés.\n`);

/* Corrections arbitrées par la direction, qui priment sur les classeurs.
   Elles avaient été appliquées à la main lors du nettoyage du référentiel ;
   les inscrire ici les rend rejouables plutôt que réservées à la mémoire
   d'une conversation. */
const ARBITRAGES: Record<string, { statut?: "salarie" | "prestataire"; site?: string }> = {
  emma: { statut: "salarie", site: "REX" },
  rafenosoa: { statut: "prestataire" },
  manitra: { site: "REX" },
};

// ── 5. Construction ───────────────────────────────────────────────────────
const now = new Date().toISOString();
const agents: Record<string, unknown>[] = [];
const badges: Record<string, unknown>[] = [];
const sansNom: string[] = [];

for (const [agentId, siteObserve] of [...utilises].sort()) {
  /* Le site vient de l'IDENTIFIANT, pas du pointage.
     Un même agent peut avoir badgé sur les deux sites ; se fier au site
     observé faisait alors fabriquer BDG-REX-23 pour AG-MIARAKA-23, en
     collision avec le badge du véritable agent REX n° 23. L'identifiant,
     lui, porte le site de façon univoque. */
  const decoupe = agentId.match(/^AG-(REX|MIARAKA)-(.+)$/);
  const site = decoupe?.[1] ?? siteObserve;
  const idPointeuse = decoupe?.[2] ?? agentId;
  const usuel = prenomParId[site]?.[idPointeuse] ?? "";
  const fiche = usuel ? fiches.get(cle(usuel)) : undefined;
  const arb = ARBITRAGES[cle(usuel)] ?? {};

  if (!fiche) sansNom.push(`${agentId}${usuel ? ` (${usuel})` : ""}`);

  agents.push({
    id: agentId,
    nom: fiche?.nom ?? "",
    prenom: fiche?.prenoms || usuel || `Agent ${idPointeuse}`,
    site: arb.site ?? site,
    statut: arb.statut ?? (prestataires.has(cle(usuel)) ? "prestataire" : "salarie"),
    poste: fiche?.poste ?? "",
    service: fiche?.service ?? "",
    horaire_id: "std",
    taux_horaire: 0,
    actif: true,
    createdat: now,
  });
  badges.push({
    id: `BDG-${site}-${idPointeuse}`,
    agent_id: agentId,
    installation: site,
    id_pointeuse: idPointeuse,
    valide_du: "",
    valide_au: "",
    note: "Restauré depuis la pointeuse et le classeur du personnel",
  });
}

const nommes = agents.filter((a) => a.nom).length;
const prest = agents.filter((a) => a.statut === "prestataire").length;
console.log(`À restaurer : ${agents.length} agents (${nommes} avec nom complet, ${prest} prestataires) et ${badges.length} badges.`);
if (sansNom.length) console.log(`\nSans correspondance nominative (${sansNom.length}) : ${sansNom.join(", ")}`);

if (!APPLY) {
  console.log("\n(lecture seule — relancez avec --apply pour écrire)");
  process.exit(0);
}

for (let i = 0; i < agents.length; i += 200) {
  await pg("POST", "agents?on_conflict=id", agents.slice(i, i + 200));
}
for (let i = 0; i < badges.length; i += 200) {
  await pg("POST", "badges?on_conflict=id", badges.slice(i, i + 200));
}
const verif = await pg("GET", "agents?select=id&limit=1000");
console.log(`\n✅ Référentiel restauré : ${verif.length} agents en base.`);
