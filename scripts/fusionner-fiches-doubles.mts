#!/usr/bin/env node
/**
 * FUSION DES FICHES AGENT EN DOUBLE.
 *
 * L'import historique a créé un agent PAR INSTALLATION : `AG-REX-26` et
 * `AG-MIARAKA-5` désignent le même Hervé, qui badge aux deux endroits. Ses
 * heures sont donc coupées en deux, et aucun état mensuel ne peut être juste
 * tant que les deux fiches vivent séparément.
 *
 * Le modèle de données prévoyait déjà le cas : `badges.agent_id` permet à
 * UNE personne de porter PLUSIEURS badges, un par pointeuse. Il n'a jamais
 * été utilisé ainsi — c'est ce que cette fusion rétablit.
 *
 * ── CE QUI EST ARBITRÉ, ET COMMENT ───────────────────────────────────────
 * DEUX FICHES NE SONT FUSIONNÉES QUE SI LE PRÉNOM ET LE NOM COÏNCIDENT.
 * Jamais sur le seul patronyme : GERMAIN RAKOTONIRINA (cuisinier à MIARAKA)
 * et Finiavana Mihary Valisoa RAKOTONIRINA (pharmacienne à REX) le
 * partagent et sont deux personnes. Les fusionner aurait mêlé leurs heures
 * sur une fiche de paie.
 *
 * LA FICHE CONSERVÉE EST LA PLUS ALIMENTÉE — celle qui porte le plus de
 * passages. Moins de lignes à déplacer, donc moins de surface d'erreur.
 *
 * RIEN N'EST SUPPRIMÉ. La fiche absorbée est archivée (`actif = false`),
 * jamais effacée : un identifiant qui disparaît laisse des lignes
 * orphelines dans les états déjà imprimés.
 *
 * Usage :
 *   npx tsx scripts/fusionner-fiches-doubles.mts            # simulation
 *   npx tsx scripts/fusionner-fiches-doubles.mts --apply
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

function entetes(schema: string, ecriture = false) {
  const h: Record<string, string> = { apikey: K, Authorization: `Bearer ${K}`, "Accept-Profile": schema };
  if (ecriture) {
    h["Content-Type"] = "application/json";
    h["Content-Profile"] = schema;
    h.Prefer = "return=representation";
  }
  return h;
}
async function lire<T>(schema: string, path: string): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; ; off += 1000) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`${U}/rest/v1/${path}${sep}limit=1000&offset=${off}`, { headers: entetes(schema) });
    if (!r.ok) throw new Error(`${path} → ${r.status} ${(await r.text()).slice(0, 160)}`);
    const page = (await r.json()) as T[];
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}
async function ecrire(schema: string, path: string, body: unknown, methode = "PATCH") {
  const r = await fetch(`${U}/rest/v1/${path}`, {
    method: methode,
    headers: entetes(schema, true),
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${methode} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : [];
}

const norm = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

interface AgentRow { id: string; prenom: string; nom: string; site: string; poste: string; statut: string; actif: boolean }
interface Ref { schema: string; table: string }

/** Toutes les tables qui désignent un agent. En oublier une laisserait des
    lignes rattachées à une fiche archivée — invisibles, donc perdues. */
const REFERENCES: Ref[] = [
  { schema: "pointage", table: "pointages" },
  { schema: "pointage", table: "badges" },
  { schema: "pointage", table: "ajustements" },
  { schema: "pointage", table: "heures_sup" },
  { schema: "planning", table: "affectations" },
];

const agents = await lire<AgentRow>("pointage", "agents?select=id,prenom,nom,site,poste,statut,actif&order=id.asc");

// ── Constitution des groupes ──────────────────────────────────────────────
const groupes = new Map<string, AgentRow[]>();
for (const a of agents) {
  const cle = `${norm(a.prenom)}|${norm(a.nom)}`;
  if (!norm(a.prenom) || !norm(a.nom)) continue; // un prénom seul ne prouve rien
  groupes.set(cle, [...(groupes.get(cle) ?? []), a]);
}
const doubles = [...groupes.values()].filter((g) => g.length > 1);

// ── Ce qu'il faudra déplacer ──────────────────────────────────────────────
const comptes = new Map<string, Record<string, number>>();
for (const { schema, table } of REFERENCES) {
  const lignes = await lire<{ agent_id: string }>(schema, `${table}?select=agent_id`);
  for (const l of lignes) {
    const c = comptes.get(l.agent_id) ?? {};
    c[table] = (c[table] ?? 0) + 1;
    comptes.set(l.agent_id, c);
  }
}
const total = (id: string) => Object.values(comptes.get(id) ?? {}).reduce((s, n) => s + n, 0);
const passages = (id: string) => comptes.get(id)?.pointages ?? 0;

// Les affectations portent un index unique (planning, agent, jour, service) :
// deux fiches affectées le même jour au même service se heurteraient.
const affectations = await lire<{ id: string; planning_id: string; agent_id: string; jour: string; service_id: string }>(
  "planning",
  "affectations?select=id,planning_id,agent_id,jour,service_id",
);

console.log(`${agents.length} agents · ${doubles.length} personne(s) sous plusieurs fiches\n`);

interface Plan { canon: AgentRow; absorbees: AgentRow[]; collisions: string[] }
const plans: Plan[] = [];

for (const g of doubles) {
  const trie = [...g].sort((a, b) => passages(b.id) - passages(a.id) || a.id.localeCompare(b.id));
  const [canon, ...absorbees] = trie;
  const clesCanon = new Set(
    affectations.filter((a) => a.agent_id === canon.id).map((a) => `${a.planning_id}|${a.jour}|${a.service_id}`),
  );
  const collisions = affectations
    .filter((a) => absorbees.some((d) => d.id === a.agent_id))
    .filter((a) => clesCanon.has(`${a.planning_id}|${a.jour}|${a.service_id}`))
    .map((a) => a.id);

  plans.push({ canon, absorbees, collisions });

  console.log(`${canon.prenom} ${canon.nom}`.trim());
  console.log(
    `   CONSERVÉE  ${canon.id.padEnd(16)} ${canon.site.padEnd(8)} ${String(passages(canon.id)).padStart(4)} passages · ${total(canon.id)} lignes au total`,
  );
  for (const d of absorbees) {
    const c = comptes.get(d.id) ?? {};
    const detail = Object.entries(c).map(([t, n]) => `${t} ${n}`).join(", ") || "aucune ligne";
    console.log(`   absorbée   ${d.id.padEnd(16)} ${d.site.padEnd(8)} ${String(passages(d.id)).padStart(4)} passages · ${detail}`);
  }
  if (collisions.length) {
    console.log(`   ⚠ ${collisions.length} affectation(s) en collision (même planning, jour et service) — elles seront SUPPRIMÉES du doublon`);
  }
  if (canon.poste !== absorbees[0]?.poste) {
    console.log(`   ℹ postes divergents : « ${canon.poste || "—"} » / « ${absorbees.map((d) => d.poste || "—").join(", ")} » — celui de la fiche conservée est retenu`);
  }
}

const aDeplacer = plans.reduce((s, p) => s + p.absorbees.reduce((t, d) => t + total(d.id), 0), 0);
console.log(`\n${aDeplacer} lignes à rattacher · ${plans.reduce((s, p) => s + p.absorbees.length, 0)} fiche(s) à archiver`);

if (!APPLY) {
  console.log("\n(simulation — relancez avec --apply)");
  process.exit(0);
}

// ── Écriture ──────────────────────────────────────────────────────────────
const horodatage = new Date().toISOString();
let deplacees = 0;

for (const { canon, absorbees, collisions } of plans) {
  for (const id of collisions) {
    await ecrire("planning", `affectations?id=eq.${id}`, undefined, "DELETE").catch(() => {});
  }
  for (const d of absorbees) {
    for (const { schema, table } of REFERENCES) {
      const n = comptes.get(d.id)?.[table] ?? 0;
      if (!n) continue;
      const res = await ecrire(schema, `${table}?agent_id=eq.${d.id}`, { agent_id: canon.id });
      deplacees += Array.isArray(res) ? res.length : 0;
    }
    await ecrire("pointage", `agents?id=eq.${d.id}`, { actif: false });
    console.log(`   ${d.id} → ${canon.id} · fiche archivée`);
  }
}

console.log(`\n✅ ${deplacees} lignes rattachées`);

// ── Trace ─────────────────────────────────────────────────────────────────
/* Une fusion d'identités doit rester lisible dans six mois : sans trace,
   personne ne saura pourquoi un agent porte deux badges. */
await ecrire(
  "logistique",
  "audit_log",
  plans.flatMap(({ canon, absorbees }) =>
    absorbees.map((d) => ({
      id: `AUD-FUSION-${d.id}-${horodatage.slice(0, 19).replace(/[-:T]/g, "")}`,
      timestamp: horodatage,
      userId: "script",
      userEmail: "informatique.lavitaperte@gmail.com",
      action: "update",
      targetType: "pointage.agents",
      targetId: d.id,
      details: `Fiche en double fusionnée dans ${canon.id} (${canon.prenom} ${canon.nom}) : une personne, un badge par pointeuse.`,
      ip: "",
      userAgent: "scripts/fusionner-fiches-doubles.mts",
    })),
  ),
  "POST",
).catch((e) => console.log(`   (trace d'audit non écrite : ${String(e).slice(0, 90)})`));

// ── Vérification ──────────────────────────────────────────────────────────
const apres = await lire<AgentRow>("pointage", "agents?select=id,prenom,nom,actif&order=id.asc");
const restants = new Map<string, number>();
for (const a of apres.filter((x) => x.actif)) {
  const cle = `${norm(a.prenom)}|${norm(a.nom)}`;
  if (!norm(a.prenom) || !norm(a.nom)) continue;
  restants.set(cle, (restants.get(cle) ?? 0) + 1);
}
const encoreDoubles = [...restants.values()].filter((n) => n > 1).length;
console.log(`Vérification : ${apres.filter((a) => a.actif).length} fiches actives · ${encoreDoubles} doublon(s) restant(s)`);

for (const { canon } of plans) {
  const badges = await lire<{ id: string; installation: string }>("pointage", `badges?select=id,installation&agent_id=eq.${canon.id}`);
  console.log(`   ${canon.prenom} ${canon.nom} → ${badges.map((b) => b.installation).join(" + ") || "aucun badge"}`.trim());
}
