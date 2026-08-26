#!/usr/bin/env node
/**
 * SYNCHRONISATION D'UNE SEMAINE REX SUR LA DERNIÈRE VERSION DU CLASSEUR.
 *
 * L'import, lui, n'AJOUTE que ce qui manque. C'est le bon comportement pour
 * une reprise d'historique, et le mauvais dès qu'une semaine est révisée :
 * une ligne retirée du fichier reste alors en base indéfiniment.
 *
 * Or les semaines SONT révisées. Le classeur du 21 août porte, pour la
 * semaine du 17 au 23, une version postérieure à celle importée le 12 : Dc
 * Aly en est retiré, conformément au courriel du 13 août annonçant son
 * indisponibilité, et Lauria remplace Franco sur plusieurs après-midi
 * d'administration. Sans retrait, Dc Aly resterait éternellement planifié
 * un jour où il n'est pas venu, et le calcul des écarts lui compterait une
 * absence qu'il n'a pas commise.
 *
 * On aligne donc la base sur le fichier, dans les deux sens, une semaine à
 * la fois. Ce qui disparaît est sauvegardé avant.
 *
 * PRUDENCE : la synchronisation ne touche QUE les semaines nommées, et ne
 * crée pas de planning. Une semaine absente de la base est du ressort de
 * l'import, pas d'ici.
 *
 * Usage :
 *   npx tsx scripts/synchroniser-planning-rex.mts --fichier=… --feuilles=1708-2308
 *   npx tsx scripts/synchroniser-planning-rex.mts --fichier=… --feuilles=1708-2308 --apply
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { parserFeuilleRex, normaliserNom } = await import("../src/lib/planning/parseur-rex.ts");
const { resoudreAgent, HORS_REFERENTIEL, normaliserUsuel } = await import("../src/lib/pointage/alias.ts");
const { serviceDuLibelle } = await import("../src/lib/planning/services-libelles.ts");

const APPLY = process.argv.includes("--apply");
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const CHEMIN = arg("fichier");
if (!CHEMIN) throw new Error("--fichier= est obligatoire.");
const FEUILLES = arg("feuilles")?.split(",").map((f) => f.trim()).filter(Boolean);
if (!FEUILLES?.length) throw new Error("--feuilles= est obligatoire : on ne synchronise pas un classeur entier par mégarde.");

const U = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const K = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
const hdr = (s: string) => ({ apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", "Accept-Profile": s, "Content-Profile": s });
async function pg(schema: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`${U}/rest/v1/${path}`, { method, headers: hdr(schema), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

const agents: Array<{ id: string; nom: string; prenom: string; site: string; actif: boolean }> =
  await pg("pointage", "GET", "agents?select=id,nom,prenom,site,actif&limit=1000");
const services: Array<{ id: string; libelle: string }> =
  await pg("planning", "GET", "services?select=id,libelle&limit=200");
const idsServices = new Set(services.map((s) => s.id));
const nomDe = new Map(agents.map((a) => [a.id, `${a.prenom} ${a.nom}`.trim()]));
const libelleService = new Map(services.map((s) => [s.id, s.libelle]));

const cachePersonne = new Map<string, string | null>();
const ambigus = new Map<string, string[]>();
function resoudre(brut: string): string | null {
  if (cachePersonne.has(brut)) return cachePersonne.get(brut)!;
  const r = resoudreAgent(brut, agents, "REX");
  if (r.voie === "ambigu") ambigus.set(brut, r.candidats ?? []);
  cachePersonne.set(brut, r.agentId);
  return r.agentId;
}

const wb = XLSX.readFile(CHEMIN);
const FICHIER = CHEMIN.slice(CHEMIN.lastIndexOf("/") + 1);
const aCreer: Array<Record<string, unknown>> = [];
const aRetirer: Array<Record<string, unknown>> = [];
const inconnus = new Map<string, number>();

for (const feuille of FEUILLES) {
  if (!wb.Sheets[feuille]) throw new Error(`Feuille « ${feuille} » absente de ${FICHIER}.`);
  const r = parserFeuilleRex(feuille, XLSX.utils.sheet_to_json(wb.Sheets[feuille], { header: 1, raw: false }));
  const suspects = new Set(
    r.anomalies.map((a) => /le (\d{4}-\d{2}-\d{2}) n'est pas/.exec(a)?.[1]).filter(Boolean) as string[],
  );
  const jours = r.jours.filter((j) => !suspects.has(j)).sort();
  if (!jours.length) throw new Error(`Feuille « ${feuille} » : aucun jour exploitable.`);
  const idPlanning = `PLN-REX-${jours[0].replace(/-/g, "")}`;

  const [plan] = await pg("planning", "GET", `plannings?select=id,du,au,statut&id=eq.${idPlanning}`);
  if (!plan) throw new Error(`${idPlanning} absent de la base : c'est un import, pas une synchronisation.`);

  // ── Ce que le fichier dit ────────────────────────────────────────────────
  const voulu = new Map<string, Record<string, unknown>>();
  for (const a of r.affectations) {
    if (suspects.has(a.jour)) continue;
    const serviceId = serviceDuLibelle(a.service, idsServices);
    const tous = new Set([...a.matin, ...a.apresMidi]);
    for (const brut of tous) {
      const cle = normaliserNom(brut);
      const agentId = resoudre(brut);
      if (!agentId) {
        if (!HORS_REFERENTIEL.has(normaliserUsuel(brut))) inconnus.set(brut, (inconnus.get(brut) ?? 0) + 1);
        continue;
      }
      const matin = a.matin.some((x) => normaliserNom(x) === cle);
      const aprem = a.apresMidi.some((x) => normaliserNom(x) === cle);
      const creneau = matin && aprem ? "std" : matin ? "matin" : "aprem";
      const id = `AFF-${idPlanning}-${a.jour.replace(/-/g, "")}-${agentId}-${serviceId || "x"}`;
      voulu.set(id, {
        id, planning_id: idPlanning, agent_id: agentId, jour: a.jour,
        creneau_id: creneau, service_id: serviceId, debut: "", fin: "", lieu: a.salle,
        note: serviceId ? "" : `Service non référencé : ${a.service}`,
      });
    }
  }

  // ── Ce que la base porte ─────────────────────────────────────────────────
  const enBase: Array<Record<string, unknown>> =
    await pg("planning", "GET", `affectations?select=*&planning_id=eq.${idPlanning}&limit=1000`);
  const parId = new Map(enBase.map((a) => [a.id as string, a]));

  /* ── LA MAIN HUMAINE PRIME SUR LE FICHIER ──────────────────────────────
     L'import de REX laisse TOUJOURS `debut` et `fin` vides : les horaires y
     sont portés par le créneau, pas par l'affectation. Une ligne REX qui
     porte des heures précises a donc été saisie dans l'application, par
     quelqu'un qui savait ce qu'il faisait. Deux existent à ce jour, toutes
     deux pour la responsable administration : le 3 août de 8h à 12h, le 17
     de 8h à 11h. Les réaligner sur le fichier détruirait une décision au
     profit d'une reprise automatique. On les laisse, et on le dit. */
  const retouchee = (a: Record<string, unknown>) => Boolean(a.debut || a.fin);
  const protegees = enBase.filter(retouchee);

  const nouveaux = [...voulu.values()].filter((a) => !parId.has(a.id as string));
  const partis = enBase.filter((a) => !voulu.has(a.id as string) && !retouchee(a));
  /* Un créneau qui change (« std » devient « aprem ») garde le même
     identifiant : c'est une modification, pas un couple ajout-retrait. */
  const modifies = [...voulu.values()].filter((a) => {
    const b = parId.get(a.id as string);
    return b && !retouchee(b) && (b.creneau_id !== a.creneau_id || b.lieu !== a.lieu);
  });

  console.log(`\n${idPlanning}  ${plan.du} → ${plan.au}  (${plan.statut})   feuille « ${feuille} »`);
  console.log(`  fichier : ${voulu.size} affectations · base : ${enBase.length}`);
  console.log(`  ${nouveaux.length} à créer · ${partis.length} à retirer · ${modifies.length} à modifier`);
  if (protegees.length) {
    console.log(`  ${protegees.length} saisie(s) manuelle(s) PRÉSERVÉE(S) :`);
    for (const a of protegees)
      console.log(`    = ${a.jour} ${(nomDe.get(a.agent_id as string) ?? a.agent_id).toString().slice(0, 30).padEnd(30)} ${a.debut}-${a.fin} (créneau ${a.creneau_id})`);
  }

  const decrire = (a: Record<string, unknown>) =>
    `${a.jour} ${(nomDe.get(a.agent_id as string) ?? a.agent_id).toString().slice(0, 30).padEnd(30)} ${(libelleService.get(a.service_id as string) ?? "(sans service)").slice(0, 26).padEnd(26)} ${a.creneau_id}`;
  for (const a of nouveaux) console.log(`    + ${decrire(a)}`);
  for (const a of partis) console.log(`    − ${decrire(a)}`);
  for (const a of modifies) console.log(`    ~ ${decrire(a)}  (était ${parId.get(a.id as string)!.creneau_id})`);

  aCreer.push(...nouveaux);
  aRetirer.push(...partis);
  if (modifies.length) aCreer.push(...modifies.map((a) => ({ ...a, __maj: true })));
}

if (ambigus.size) {
  console.log(`\n⚠ ${ambigus.size} nom(s) ambigu(s), laissés de côté :`);
  for (const [n, c] of ambigus) console.log(`    « ${n} » → ${c.join("  |  ")}`);
}
if (inconnus.size) console.log(`⚠ ${inconnus.size} nom(s) non rattaché(s) : ${[...inconnus].map(([n, c]) => `${n} (${c})`).join(" · ")}`);

if (!APPLY) {
  console.log("\n(simulation : relancez avec --apply)");
  process.exit(0);
}

const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const sauvegarde = `/tmp/sync-rex-${horodatage}.json`;
writeFileSync(sauvegarde, JSON.stringify({ fichier: FICHIER, feuilles: FEUILLES, retires: aRetirer }, null, 2));
console.log(`\nlignes retirées sauvegardées : ${sauvegarde}`);

for (const a of aRetirer) await pg("planning", "DELETE", `affectations?id=eq.${a.id}`);
const maj = aCreer.filter((a) => a.__maj);
const neufs = aCreer.filter((a) => !a.__maj);
for (const a of maj) {
  const { id, __maj, ...champs } = a;
  void __maj;
  await pg("planning", "PATCH", `affectations?id=eq.${id}`, champs);
}
for (let i = 0; i < neufs.length; i += 500) await pg("planning", "POST", "affectations", neufs.slice(i, i + 500));
console.log(`✅ ${neufs.length} créée(s) · ${aRetirer.length} retirée(s) · ${maj.length} modifiée(s)`);
