#!/usr/bin/env node
/**
 * DEUX CORRECTIONS DE RÉFÉRENTIEL, 13 août 2026.
 *
 * ── 1. MENJA N'EXISTAIT PAS ──────────────────────────────────────────────
 * 470 affectations la citent dans les plannings de MIARAKA, et aucune fiche
 * ne lui répondait : elle travaillait sans exister dans le système. Elle
 * s'appelle NOMENJANAHARY ; « Menja » est son nom usuel.
 *
 * Sa fiche est créée SANS BADGE, et c'est un fait mesuré, pas un oubli :
 * les exports bruts de la pointeuse MIARAKA de mai et juin listent les
 * quatorze identifiants enrôlés — 4, 5, 13, 14, 16, 17, 21, 23, 24, 26, 28,
 * 29, 30, 31 — et aucun n'est le sien. Lui inventer un numéro attribuerait
 * les passages de quelqu'un d'autre à son bulletin. Ses heures ne seront
 * donc pas mesurables tant qu'elle n'aura pas de badge ; son planning, lui,
 * la reconnaît désormais.
 *
 * ── 2. L'IDENTIFIANT MIARAKA-17 N'ÉTAIT PAS JEANINE ──────────────────────
 * Le référentiel nommait `AG-MIARAKA-17` « Jeanine RALAIVOAVY ». La
 * pointeuse, elle, l'appelle « Rova » sur ses douze passages de mai et
 * juin — c'est Niry Rovaniaina RAZAFIMAMONJY, déjà présente sous
 * `AG-REX-28`. La fusion des fiches en double, ce matin, s'est fiée à
 * l'étiquette et a versé les heures de Rova sur la fiche de Jeanine.
 *
 * La correction est chirurgicale parce que les identifiants sont parlants :
 * les passages de Rova portent `PTG-MIARAKA-17-…`, ceux de Jeanine
 * `PTG-REX-23-…`, et les deux cohabitent aujourd'hui sur la même fiche.
 * Ses affectations de planning, elles, existent DÉJÀ en double sous
 * `AG-REX-28` — même planning, même jour, même créneau : les rattacher
 * violerait la contrainte d'unicité. On supprime donc le doublon plutôt que
 * de le déplacer ; ce n'est pas un fait qui disparaît, c'est le même fait
 * écrit deux fois.
 *
 * Usage :
 *   npx tsx scripts/corriger-referentiel-aout.mts            # simulation
 *   npx tsx scripts/corriger-referentiel-aout.mts --apply
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
const H = (schema: string, ecrit = false) => {
  const h: Record<string, string> = { apikey: K, Authorization: `Bearer ${K}`, "Accept-Profile": schema };
  if (ecrit) {
    h["Content-Type"] = "application/json";
    h["Content-Profile"] = schema;
    h.Prefer = "return=representation";
  }
  return h;
};
async function lire<T>(schema: string, path: string): Promise<T[]> {
  const r = await fetch(`${U}/rest/v1/${path}`, { headers: H(schema) });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.json();
}
async function ecrire(schema: string, path: string, body: unknown, methode = "PATCH") {
  const r = await fetch(`${U}/rest/v1/${path}`, {
    method: methode,
    headers: H(schema, true),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${methode} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : [];
}

const MENJA = "AG-MIARAKA-MENJA"; // pas un numéro de pointeuse : elle n'en a pas
const ROVA = "AG-REX-28";
const JEANINE = "AG-REX-23";

// ── État des lieux ────────────────────────────────────────────────────────
const agents = await lire<{ id: string; prenom: string; nom: string; actif: boolean }>(
  "pointage",
  "agents?select=id,prenom,nom,actif&limit=200",
);
const dejaMenja = agents.some((a) => a.id === MENJA);

const ptgRova = await lire<{ id: string; horodatage: string }>(
  "pointage",
  `pointages?select=id,horodatage&agent_id=eq.${JEANINE}&id=like.PTG-MIARAKA-17-*&order=horodatage.asc`,
);
const affRova = await lire<{ id: string; planning_id: string; jour: string; service_id: string }>(
  "planning",
  `affectations?select=id,planning_id,jour,service_id&agent_id=eq.${JEANINE}&id=like.*AG-MIARAKA-17`,
);
const affExistantes = await lire<{ planning_id: string; jour: string; service_id: string }>(
  "planning",
  `affectations?select=planning_id,jour,service_id&agent_id=eq.${ROVA}`,
);
const clesRova = new Set(affExistantes.map((a) => `${a.planning_id}|${a.jour}|${a.service_id}`));
const doublons = affRova.filter((a) => clesRova.has(`${a.planning_id}|${a.jour}|${a.service_id}`));
const aDeplacer = affRova.filter((a) => !clesRova.has(`${a.planning_id}|${a.jour}|${a.service_id}`));
const badge = await lire<{ id: string }>(
  "pointage",
  `badges?select=id&agent_id=eq.${JEANINE}&installation=eq.MIARAKA`,
);

console.log(`1. Menja NOMENJANAHARY : ${dejaMenja ? "fiche déjà présente" : "fiche à créer (sans badge)"}`);
console.log(`2. Rova, à reprendre sur la fiche de Jeanine :`);
console.log(`     ${ptgRova.length} passages PTG-MIARAKA-17-… → ${ROVA}`);
if (ptgRova.length) console.log(`        du ${ptgRova[0].horodatage} au ${ptgRova.at(-1)!.horodatage}`);
console.log(`     ${badge.length} badge MIARAKA → ${ROVA}`);
console.log(`     ${aDeplacer.length} affectation(s) à déplacer · ${doublons.length} doublon(s) exact(s) à retirer`);

if (!APPLY) {
  console.log("\n(simulation — relancez avec --apply)");
  process.exit(0);
}

// ── Application ───────────────────────────────────────────────────────────
if (!dejaMenja) {
  await ecrire(
    "pointage",
    "agents",
    [
      {
        id: MENJA,
        nom: "NOMENJANAHARY",
        prenom: "Menja",
        site: "MIARAKA",
        statut: "salarie",
        poste: "",
        service: "",
        horaire_id: "std",
        taux_horaire: 0,
        actif: true,
        // Postgres replie les identifiants non quotés : la colonne est `createdat`.
        createdat: new Date().toISOString(),
      },
    ],
    "POST",
  );
  console.log(`✅ fiche créée : ${MENJA} — Menja NOMENJANAHARY (MIARAKA, sans badge)`);
}

for (const p of ptgRova) await ecrire("pointage", `pointages?id=eq.${p.id}`, { agent_id: ROVA });
for (const b of badge) await ecrire("pointage", `badges?id=eq.${b.id}`, { agent_id: ROVA });
for (const a of aDeplacer) await ecrire("planning", `affectations?id=eq.${a.id}`, { agent_id: ROVA });
for (const a of doublons) await ecrire("planning", `affectations?id=eq.${a.id}`, undefined, "DELETE");
console.log(
  `✅ ${ptgRova.length} passages, ${badge.length} badge et ${aDeplacer.length} affectation(s) rendus à Rova · ${doublons.length} doublon(s) retiré(s)`,
);

/* La fiche archivée garde le nom qu'elle aurait toujours dû porter : sans
   cela, une fusion future répéterait exactement la même erreur. */
await ecrire("pointage", "agents?id=eq.AG-MIARAKA-17", {
  prenom: "Rova",
  nom: "RAZAFIMAMONJY",
});
console.log("✅ AG-MIARAKA-17 renommée « Rova RAZAFIMAMONJY » (fiche archivée)");

// ── Vérification ──────────────────────────────────────────────────────────
for (const [id, qui] of [
  [ROVA, "Rova"],
  [JEANINE, "Jeanine"],
  [MENJA, "Menja"],
] as const) {
  const p = await lire<{ id: string }>("pointage", `pointages?select=id&agent_id=eq.${id}&limit=200`);
  const b = await lire<{ installation: string }>("pointage", `badges?select=installation&agent_id=eq.${id}`);
  const a = await lire<{ id: string }>("planning", `affectations?select=id&agent_id=eq.${id}&limit=1000`);
  console.log(
    `   ${qui.padEnd(8)} ${String(p.length).padStart(3)} passages · badges ${b.map((x) => x.installation).join("+") || "aucun"} · ${a.length} affectations`,
  );
}
