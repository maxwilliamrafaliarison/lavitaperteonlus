#!/usr/bin/env node
/**
 * RÉFÉRENTIEL DU PERSONNEL — complète les fiches agents (nom de famille,
 * site de rattachement, statut salarié/prestataire) à partir de la liste
 * officielle d'émargement du 26/06/2026 (62 personnes).
 *
 * Le statut « prestataire » compte : c'est lui qui déclenche la règle LIM
 * (entrée plafonnée à 7:50 / 13:50) dans le calcul du temps de travail.
 *
 * ⚠️ HOMONYMES : « Emma » désigne DEUX personnes (RASOAMAMPIONONA Emma,
 * salariée REX n°13, et RAFENOSOA Emma, prestataire n°48). Le rapprochement
 * par prénom seul les fusionnerait. Les cas ambigus sont donc signalés et
 * JAMAIS rapprochés automatiquement — c'est au responsable de trancher.
 *
 * Usage :
 *   npx tsx scripts/referentiel-agents.mts            # simulation
 *   npx tsx scripts/referentiel-agents.mts --apply
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const APPLY = process.argv.includes("--apply");

const U = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const K = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(/[^A-Za-z0-9._-]/g, "");
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", "Accept-Profile": "pointage", "Content-Profile": "pointage" };
const pg = async (m: string, p: string, b?: unknown) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
};

/* Liste d'émargement du 26/06/2026 : n° | nom complet | catégorie. */
const LISTE: Array<{ n: number; nom: string; cat: "REX" | "MIARAKA" | "PRESTATAIRE" }> = [
  { n: 1, nom: "RATSIRALOVANIRINA Marie Alice", cat: "REX" },
  { n: 2, nom: "RAJOELISON Aliniaina", cat: "REX" },
  { n: 3, nom: "RAZANAKOTO Manitrarivo", cat: "REX" },
  { n: 4, nom: "RAZAFIMALALA Vololonboahangy N.", cat: "REX" },
  { n: 5, nom: "ZAFINIAINA Fanomezantsoa Roger", cat: "REX" },
  { n: 6, nom: "RANDRIANASOLO William", cat: "REX" },
  { n: 7, nom: "RAMIRIHARISOA Marie Perline", cat: "REX" },
  { n: 8, nom: "TSIAMIDINIAINA Sandra Pulchérie", cat: "REX" },
  { n: 9, nom: "RAMANANTSOA Marcellia", cat: "REX" },
  { n: 10, nom: "RATSIMBAZAFY Haingotiana", cat: "REX" },
  { n: 11, nom: "RABOTOMANASA Felana Manitra", cat: "REX" },
  { n: 12, nom: "RAKOTOHAJANIRINA Hervé", cat: "REX" },
  { n: 13, nom: "RASOAMAMPIONONA Emma", cat: "REX" },
  { n: 14, nom: "RAKOTOVAONIRINA Valérien Marcel", cat: "REX" },
  { n: 15, nom: "JEAN ROGER Bruno Gaston", cat: "REX" },
  { n: 16, nom: "RAZANADRANOSY Tsaralahy Angelo", cat: "REX" },
  { n: 17, nom: "NOMENJANAHARY Suzanne", cat: "MIARAKA" },
  { n: 18, nom: "RAKOTONDRAZAFY Jean Chrisostome", cat: "MIARAKA" },
  { n: 19, nom: "RAMAMINIRINA Claude Maurice", cat: "MIARAKA" },
  { n: 20, nom: "NDRIANIRINA Mamonjy Jean Claude", cat: "MIARAKA" },
  { n: 21, nom: "RAKOTONIRINA Germain", cat: "MIARAKA" },
  { n: 22, nom: "HERIFENOSOA Philibert", cat: "MIARAKA" },
  { n: 23, nom: "RAFANJANIRINA Marie Claire", cat: "MIARAKA" },
  { n: 24, nom: "RASOAMANANANDRO Fabienne", cat: "MIARAKA" },
  { n: 25, nom: "RAKOTOARIMALALA Tinalalao", cat: "MIARAKA" },
  { n: 26, nom: "TANJONA Fandresena Cynthia", cat: "MIARAKA" },
  { n: 27, nom: "RAJAONARIVELO Jeremia Anico", cat: "MIARAKA" },
  { n: 28, nom: "ADAHIMASY Diamondra", cat: "MIARAKA" },
  { n: 29, nom: "MILIARISOA Pergaudine", cat: "PRESTATAIRE" },
  { n: 30, nom: "Dc RAMAMONJINIRINA Tahina Prudence", cat: "PRESTATAIRE" },
  { n: 31, nom: "Dc RAFARALAHIVOAVY Tojo Rémi", cat: "PRESTATAIRE" },
  { n: 32, nom: "Dc RALAIVOAVY Jeanine", cat: "PRESTATAIRE" },
  { n: 33, nom: "Pr ANDRIAMAMPIONONA T. Francine", cat: "PRESTATAIRE" },
  { n: 34, nom: "Pr RAKOTOMAHENINA Hajanirina", cat: "PRESTATAIRE" },
  { n: 35, nom: "Dc RAKOTONIRINA Mahefa", cat: "PRESTATAIRE" },
  { n: 36, nom: "SOAMIANDRIRAY Stéphanie", cat: "PRESTATAIRE" },
  { n: 37, nom: "Dc RANDRIAMAHENINA Harinirina", cat: "PRESTATAIRE" },
  { n: 38, nom: "Dc RAHAROSON Alimamonjisoa", cat: "PRESTATAIRE" },
  { n: 39, nom: "HAJANIRINA Ravakiniaina Dalianne", cat: "PRESTATAIRE" },
  { n: 40, nom: "NJARIMORA Najasoa Sylvie", cat: "PRESTATAIRE" },
  { n: 41, nom: "RAHARISOA Lauria Ho Wing", cat: "PRESTATAIRE" },
  { n: 42, nom: "Madame Angèle", cat: "PRESTATAIRE" },
  { n: 43, nom: "ANJARA TOLOJANAHARY Franco Rosé", cat: "PRESTATAIRE" },
  { n: 44, nom: "RAZANAMARO Annitha Claudette", cat: "PRESTATAIRE" },
  { n: 45, nom: "RABENARSON Emilly", cat: "PRESTATAIRE" },
  { n: 46, nom: "RAKOTOALISON Valimirandraisoa Esther", cat: "PRESTATAIRE" },
  { n: 47, nom: "VOLOLONIAINA Harilala", cat: "PRESTATAIRE" },
  { n: 48, nom: "RAFENOSOA Emma", cat: "PRESTATAIRE" },
  { n: 49, nom: "NIRILALAINA Marie Lucia", cat: "PRESTATAIRE" },
  { n: 50, nom: "RAKOTONIRINA Germain Clovis", cat: "PRESTATAIRE" },
  { n: 51, nom: "RAKOTOSOLOFO Lida", cat: "PRESTATAIRE" },
  { n: 52, nom: "RASODY Faniloniaina", cat: "PRESTATAIRE" },
  { n: 53, nom: "RAMASY Bakoly", cat: "PRESTATAIRE" },
  { n: 54, nom: "SOLOFOMALALA Gaëtan Duval", cat: "PRESTATAIRE" },
  { n: 55, nom: "ANDRIAMAMANETY Arnauld", cat: "PRESTATAIRE" },
  { n: 56, nom: "RENKO Faratiana Harilanto", cat: "PRESTATAIRE" },
  { n: 57, nom: "RAKOTONDRAVELO Sylvano Onésime", cat: "PRESTATAIRE" },
  { n: 58, nom: "RATIARIVELO Volahanitra Mireille Patricia", cat: "PRESTATAIRE" },
  { n: 59, nom: "RANDIMALALA Christine Isabelle", cat: "PRESTATAIRE" },
  { n: 60, nom: "RAZAFIMAMONJY Niry Rovaniaina", cat: "PRESTATAIRE" },
  { n: 61, nom: "ANDRIARIMANANA Landitiana Alexandrine", cat: "PRESTATAIRE" },
  { n: 62, nom: "HERIMAMPIONINA Xavier", cat: "PRESTATAIRE" },
];

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
/** Mots signifiants d'un nom complet, hors titres et particules. */
const motsDe = (s: string) =>
  norm(s).split(" ").filter((w) => w.length > 2 && !["dc", "pr", "madame", "marie", "jean"].includes(w));

interface Agent { id: string; nom: string; prenom: string; site: string; statut: string }
const agents: Agent[] = await pg("GET", "agents?select=id,nom,prenom,site,statut&limit=1000");

const maj: Array<{ id: string; nom: string; site: string; statut: string; source: string }> = [];
const ambigus: string[] = [];
const sansMatch: string[] = [];

for (const a of agents) {
  const p = norm(a.prenom);
  if (!p || /^agent \d+$/.test(p)) { sansMatch.push(`${a.id} (${a.prenom})`); continue; }
  // Un candidat = une personne dont un mot du nom complet égale le prénom usuel.
  const cands = LISTE.filter((L) => motsDe(L.nom).includes(p));
  if (cands.length === 0) { sansMatch.push(`${a.id} (${a.prenom})`); continue; }
  if (cands.length > 1) {
    // Départage par site quand c'est possible ; sinon on laisse à l'humain.
    const memeSite = cands.filter((c) => (c.cat === "PRESTATAIRE" ? a.site : c.cat) === a.site);
    if (memeSite.length !== 1) {
      ambigus.push(`${a.id} « ${a.prenom} » (${a.site}) → ${cands.map((c) => `#${c.n} ${c.nom} [${c.cat}]`).join("  |  ")}`);
      continue;
    }
    cands.length = 0;
    cands.push(memeSite[0]);
  }
  const c = cands[0];
  const statut = c.cat === "PRESTATAIRE" ? "prestataire" : "salarie";
  const site = c.cat === "PRESTATAIRE" ? a.site : c.cat;
  if (a.nom !== c.nom || a.statut !== statut || a.site !== site) {
    maj.push({ id: a.id, nom: c.nom, site, statut, source: `#${c.n}` });
  }
}

/* ── Garde-fou COLLISIONS ────────────────────────────────────────────────
   Deux agents rapprochés à la même personne, c'est légitime quand ils
   viennent d'installations différentes (une personne, deux badges : Herve
   = AG-REX-26 + AG-MIARAKA-5). C'est en revanche une ERREUR quand ils
   viennent de la MÊME installation : un centre ne donne pas deux numéros
   à la même personne. Le cas réel est « RABOTOMANASA Felana Manitra », dont
   les deux prénoms attirent à tort les agents « Felana » ET « Manitra ».
   On retire alors les deux rapprochements plutôt que d'en inventer un. */
const parPersonne = new Map<number, typeof maj>();
for (const m of maj) {
  const n = Number(m.source.slice(1));
  parPersonne.set(n, [...(parPersonne.get(n) ?? []), m]);
}
const aRetirer = new Set<string>();
for (const [n, groupe] of parPersonne) {
  if (groupe.length < 2) continue;
  const parInstallation = new Map<string, string[]>();
  for (const g of groupe) {
    const inst = g.id.split("-")[1];
    parInstallation.set(inst, [...(parInstallation.get(inst) ?? []), g.id]);
  }
  for (const [inst, ids] of parInstallation) {
    if (ids.length < 2) continue;
    const personne = LISTE.find((L) => L.n === n)!;
    ambigus.push(
      `COLLISION sur #${n} ${personne.nom} : ${ids.join(" et ")} (même installation ${inst}) — prénoms distincts, une seule fiche`,
    );
    ids.forEach((id) => aRetirer.add(id));
  }
}
const majFiltre = maj.filter((m) => !aRetirer.has(m.id));
maj.length = 0;
maj.push(...majFiltre);

console.log(`${agents.length} agents en base · ${LISTE.length} personnes dans la liste officielle\n`);
console.log(`── ${maj.length} FICHES À COMPLÉTER ──`);
for (const m of maj) {
  const a = agents.find((x) => x.id === m.id)!;
  console.log(`  ${m.id.padEnd(18)} ${a.prenom.padEnd(14)} → ${m.nom.padEnd(42).slice(0, 42)} [${m.statut}] ${m.site}`);
}
if (ambigus.length) {
  console.log(`\n── ⚠️ ${ambigus.length} AMBIGUÏTÉS (non rapprochées, à trancher) ──`);
  ambigus.forEach((x) => console.log(`  ${x}`));
}
if (sansMatch.length) {
  console.log(`\n── ${sansMatch.length} agents sans correspondance dans la liste ──`);
  console.log(`  ${sansMatch.join(" · ")}`);
}

if (!APPLY) { console.log("\n(simulation — relancez avec --apply)"); process.exit(0); }

for (const m of maj) {
  await pg("PATCH", `agents?id=eq.${m.id}`, { nom: m.nom, site: m.site, statut: m.statut });
}
console.log(`\n✅ ${maj.length} fiches complétées.`);
const presta: Agent[] = await pg("GET", "agents?select=id&statut=eq.prestataire&limit=1000");
console.log(`   ${presta.length} agents marqués « prestataire » → règle LIM active pour eux.`);
