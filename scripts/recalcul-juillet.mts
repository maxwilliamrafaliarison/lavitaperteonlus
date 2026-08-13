#!/usr/bin/env node
/**
 * RECALCUL DE JUILLET 2026 DEPUIS LES BADGEAGES.
 *
 * Confronte, personne par personne, ce que les classeurs de la RH ont
 * déclaré et ce que disent les 15 499 passages enregistrés en base.
 *
 * ── POURQUOI CE N'EST PAS UN SIMPLE « SOMMER LES HEURES » ────────────────
 * LES GARDES FRANCHISSENT MINUIT. Un poste 17H-6H produit un badge le soir
 * du jour J et un le matin du jour J+1. Apparier à l'intérieur d'une
 * journée civile — ce que fait la formule du classeur — rend zéro heure
 * les deux jours. On apparie donc les passages EN CONTINU sur le mois, dans
 * l'ordre chronologique, et une paire peut franchir minuit.
 *
 * UN PASSAGE MANQUANT DÉCALE TOUT CE QUI SUIT. C'est le défaut inverse de
 * l'appariement continu, et il est plus sournois que celui du classeur.
 * Toute paire dépassant `PAIRE_MAX_HEURES` est donc écartée du total et
 * comptée à part : mieux vaut un total incomplet et signalé qu'un total
 * complet et faux. C'est exactement l'erreur qui a fait payer 24 heures
 * fictives à Manitra en juillet.
 *
 * LA COUVERTURE EST DITE AVANT L'ÉCART. Comparer les heures de quelqu'un
 * qui a badgé trois fois dans le mois n'a aucun sens : à MIARAKA, la
 * pointeuse ne voit qu'une fraction du travail. Chaque ligne porte donc sa
 * couverture, et les écarts des personnes mal couvertes ne sont pas
 * totalisés — les afficher comme des « heures perdues » serait un
 * mensonge par arithmétique.
 *
 * Usage : npx tsx scripts/recalcul-juillet.mts [--csv]
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { fusionnerPassages } = await import("../src/lib/pointage/calcul.ts");

const DU = "2026-07-01";
const AU = "2026-07-31";
/** Au-delà, la paire trahit un passage manquant plutôt qu'un long service. */
const PAIRE_MAX_HEURES = 16;
/** En deçà, trop de journées manquent pour que la comparaison veuille dire quelque chose.
    Réglé haut à dessein : Felana affiche 54 % de couverture et un écart de −127 h, qui ne
    mesure pas des heures perdues mais douze jours que la pointeuse n'a pas vus. */
const COUVERTURE_MIN = 0.9;

const DOSSIER = "/Users/maxwilliamrafaliarison/Downloads";
const CLASSEURS = [
  { fichier: "Pointage  REX+MAHASOA  JUILLET 2026.xlsx", origine: "REX" },
  { fichier: "MIARAKA Pointage_ Juillet 2026.xlsx", origine: "MIARAKA" },
  { fichier: "Pointage Prestataire JUILLET2026 .xlsx", origine: "PRESTA" },
];

/* Les onglets « X MA » et « X DEF » sont deux reprises de la même personne ;
   « DEF » fait foi quand il existe. On garde la meilleure et on signale. */
const suffixe = /\s+(MA|DEF|Pointage|envoi\s*def|envoyé\s*Def)\s*$/i;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^(dr|sf|mme|pr)\s+/i, "")
    .replace(/[^a-z0-9]/g, "");

/* Onglets nommés par un surnom que rien ne relie au nom d'état civil.
   Chacun est ARBITRÉ, pas deviné : « Naina » est bien Zafiniaina Roger
   Fanomezantsoa, agent de sécurité, dont le classeur porte le service
   06h-18h que ce poste est seul à tenir. Un rapprochement approximatif sur
   des heures payées vaut moins que pas de rapprochement du tout. */
const ALIAS: Record<string, string> = {
  naina: "AG-REX-18", // agent de sécurité 06h-18h
  voahangy: "AG-REX-20", // VOLOLOMBOAHANGY NIVONTSOA TIANA RAZAFIMALALA
  emily: "AG-REX-41", // Emilly RABENARSON
  emilly: "AG-REX-41",
  mirana: "AG-REX-3", // Valimirandraisoa Esther RAKOTOALISON
  vololona: "AG-REX-19", // Harilala VOLOLONIAINA
  aly: "AG-REX-43", // Alimamonjisoa RAHAROSON
  dalianne: "AG-REX-24",
  isabelle: "AG-REX-25", // Christine Isabelle RANDIMALALA (prestataire REX)
};
/** Surnoms propres à MIARAKA : le même mot désigne quelqu'un d'autre à REX. */
const ALIAS_MIARAKA: Record<string, string> = {
  feno: "AG-MIARAKA-21", // PHILBERT HERIFENOSOA
  philbert: "AG-MIARAKA-21",
  toma: "AG-MIARAKA-24", // JEAN CHRYSOSTOME RAKOTONDRAZAFY
  tome: "AG-MIARAKA-24",
  fanja: "AG-MIARAKA-23",
  jeanclaude: "AG-MIARAKA-29",
  anico: "AG-MIARAKA-30",
  maurice: "AG-MIARAKA-31",
  germain: "AG-MIARAKA-28",
  cynthia: "AG-MIARAKA-14",
  fabienne: "AG-MIARAKA-26",
};

// ── Base ──────────────────────────────────────────────────────────────────
const U = (process.env.SUPABASE_URL || process.env.PATIENTS_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const K = (process.env.SUPABASE_SERVICE_KEY || process.env.PATIENTS_SUPABASE_SERVICE_KEY || "").replace(
  /[^A-Za-z0-9._-]/g,
  "",
);
const H = { apikey: K, Authorization: `Bearer ${K}`, "Accept-Profile": "pointage" };
async function pg<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${U}/rest/v1/${path}&limit=1000&offset=${off}`, { headers: H });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
    const page = (await r.json()) as T[];
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

interface AgentRow { id: string; prenom: string; nom: string; site: string; poste: string; actif: boolean; statut: string }
interface PointageRow { agent_id: string; horodatage: string; jour: string; site_pointage: string }

const agents = await pg<AgentRow>("agents?select=id,prenom,nom,site,poste,actif,statut&order=id.asc");

/* ── UNE PERSONNE, DEUX FICHES ────────────────────────────────────────────
   L'import historique a créé un agent PAR INSTALLATION : `AG-REX-26` et
   `AG-MIARAKA-5` désignent le même Hervé, qui badge aux deux endroits. Ses
   353 passages tombent sur la première fiche, 3 sur la seconde — d'où
   l'illusion que « la pointeuse de MIARAKA ne voit rien ». Onze personnes
   sont dans ce cas, 3 299 passages en tout.

   On réunit les identités ICI, en mémoire, sans rien écrire en base : la
   fusion des fiches est une décision qui engage la paie et demande une
   confirmation humaine. Le rapprochement se fait sur le PRÉNOM ET LE NOM,
   jamais sur le seul patronyme — GERMAIN RAKOTONIRINA et Finiavana Mihary
   Valisoa RAKOTONIRINA partagent le nom de famille et sont deux personnes
   différentes. Fusionner sur le patronyme seul aurait mélangé leurs heures. */
const identite = new Map<string, string>(); // agent.id → identité canonique
const parNomComplet = new Map<string, string>();
for (const a of agents) {
  const cle = norm(`${a.prenom}|${a.nom}`);
  if (!cle || cle === "|") continue;
  const canon = parNomComplet.get(cle);
  if (canon) identite.set(a.id, canon);
  else parNomComplet.set(cle, a.id);
}
const canonique = (id: string) => identite.get(id) ?? id;
if (identite.size) {
  console.log(`${identite.size} fiche(s) rattachée(s) à une identité déjà connue (même prénom ET même nom) :`);
  for (const [double, canon] of identite) {
    const a = agents.find((x) => x.id === canon);
    console.log(`   ${double.padEnd(16)} → ${canon.padEnd(16)} ${(a?.prenom + " " + (a?.nom ?? "")).trim()}`);
  }
  console.log();
}
const pointages = await pg<PointageRow>(
  `pointages?select=agent_id,horodatage,jour,site_pointage&and=(jour.gte.${DU},jour.lte.${AU})&order=horodatage.asc`,
);
console.log(`Base : ${agents.length} agents · ${pointages.length} passages du ${DU} au ${AU}\n`);

// ── Ce que disent les badges ──────────────────────────────────────────────
interface Mesure {
  passages: number;
  minutes: number;
  paires: number;
  minutesEcartees: number;
  pairesEcartees: number;
  jours: Set<string>;
  sites: Set<string>;
}
const mesures = new Map<string, Mesure>();
const parAgent = new Map<string, PointageRow[]>();
for (const p of pointages) {
  const cle = canonique(p.agent_id);
  const a = parAgent.get(cle) ?? [];
  a.push(p);
  parAgent.set(cle, a);
}
// Réunir deux fiches, c'est mêler deux flux : il faut retrier.
for (const lignes of parAgent.values()) lignes.sort((a, b) => a.horodatage.localeCompare(b.horodatage));

for (const [agentId, lignes] of parAgent) {
  const fusionnes = fusionnerPassages(lignes.map((l) => ({ horodatage: l.horodatage, jour: l.jour })));
  const m: Mesure = {
    passages: fusionnes.length,
    minutes: 0,
    paires: 0,
    minutesEcartees: 0,
    pairesEcartees: 0,
    jours: new Set(lignes.map((l) => l.jour)),
    sites: new Set(lignes.map((l) => l.site_pointage).filter(Boolean)),
  };
  /* APPARIEMENT PAR JOURNÉE, AVEC REPORT DE GARDE.
     L'appariement continu sur tout le mois est trop fragile : un seul
     passage manquant décale la parité et fausse les vingt jours suivants.
     On apparie donc à l'intérieur de la journée, et l'on ne reporte au
     lendemain qu'une entrée restée ouverte APRÈS MIDI — c'est la signature
     d'une garde de nuit (17H-6H), et d'elle seule. Une entrée orpheline du
     matin est une sortie oubliée : elle s'arrête là, sans contaminer la
     suite. */
  const parJourFusion = new Map<string, string[]>();
  for (const h of fusionnes) {
    const j = h.slice(0, 10);
    (parJourFusion.get(j) ?? parJourFusion.set(j, []).get(j)!).push(h);
  }
  let reporte: string | null = null;
  for (const j of [...parJourFusion.keys()].sort()) {
    const file = reporte ? [reporte, ...parJourFusion.get(j)!] : [...parJourFusion.get(j)!];
    reporte = null;
    let i = 0;
    for (; i + 1 < file.length; i += 2) {
      const t0 = Date.parse(file[i].replace(" ", "T") + "Z");
      const t1 = Date.parse(file[i + 1].replace(" ", "T") + "Z");
      const min = Math.round((t1 - t0) / 60000);
      if (min <= 0) continue;
      if (min > PAIRE_MAX_HEURES * 60) {
        m.minutesEcartees += min;
        m.pairesEcartees += 1;
      } else {
        m.minutes += min;
        m.paires += 1;
      }
    }
    if (i < file.length) {
      const orphelin = file[i];
      if (Number(orphelin.slice(11, 13)) >= 12) reporte = orphelin; // garde de nuit
      else m.pairesEcartees += 1; // sortie non badgée : on s'arrête là
    }
  }
  mesures.set(agentId, m);
}

// ── Ce que déclarent les classeurs ────────────────────────────────────────
interface Declare { onglet: string; origine: string; minutes: number; jours: number; negatives: number }
const declares: Declare[] = [];

for (const { fichier, origine } of CLASSEURS) {
  const wb = XLSX.readFile(`${DOSSIER}/${fichier}`);
  for (const onglet of wb.SheetNames) {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[onglet], { header: 1, defval: "", raw: true });
    const entete = (rows[1] ?? []).map((c) => String(c).trim());
    const iWork = entete.lastIndexOf("Work");
    if (iWork < 0) continue;
    let minutes = 0;
    let jours = 0;
    let negatives = 0;
    /* On resomme la colonne Work JOUR PAR JOUR plutôt que de lire le total
       du bas : 125 formules SUM du classeur s'arrêtent avant la fin du mois,
       et trois totaux sont en #REF!. Le total du bas n'est pas fiable. */
    for (const r of rows.slice(2, 34)) {
      if (typeof r[0] !== "number") continue;
      const v = r[iWork];
      if (typeof v !== "number" || v === 0) continue;
      if (v < 0) {
        negatives += Math.round(-v * 1440);
        continue; // une durée négative n'est pas du temps travaillé
      }
      minutes += Math.round(v * 1440);
      jours += 1;
    }
    declares.push({ onglet, origine, minutes, jours, negatives });
  }
}

// ── Rapprochement onglet ↔ agent ──────────────────────────────────────────
const parNom = new Map<string, AgentRow>();
for (const a of agents) {
  for (const cle of [norm(a.prenom), norm(`${a.prenom}${a.nom}`)]) if (cle && !parNom.has(cle)) parNom.set(cle, a);
}
const parId = new Map(agents.map((a) => [a.id, a]));
function trouver(onglet: string, origine: string): AgentRow | undefined {
  const base = norm(onglet.replace(suffixe, ""));
  if (origine === "MIARAKA" && ALIAS_MIARAKA[base]) return parId.get(ALIAS_MIARAKA[base]);
  if (ALIAS[base]) return parId.get(ALIAS[base]);
  if (parNom.has(base)) return parNom.get(base);
  // Un prénom d'onglet doit se retrouver dans le nom complet de l'agent.
  return agents.find((a) => {
    const complet = norm(`${a.prenom}${a.nom}`);
    return base.length >= 4 && (complet.includes(base) || (base.includes(norm(a.prenom)) && norm(a.prenom).length >= 4));
  });
}

/* Une personne peut avoir plusieurs onglets (MA / DEF / Pointage) : on
   retient le plus fourni, et on dit combien d'autres existaient. */
const parPersonne = new Map<string, { agent?: AgentRow; onglets: Declare[] }>();
for (const d of declares) {
  const agent = trouver(d.onglet, d.origine);
  const cle = agent?.id ?? `?${norm(d.onglet.replace(suffixe, ""))}`;
  const e = parPersonne.get(cle) ?? { agent, onglets: [] };
  e.onglets.push(d);
  parPersonne.set(cle, e);
}

// ── Rapport ───────────────────────────────────────────────────────────────
const hhmm = (min: number) => `${min < 0 ? "-" : ""}${Math.floor(Math.abs(min) / 60)}:${String(Math.abs(min) % 60).padStart(2, "0")}`;

interface Ligne {
  nom: string; site: string; onglets: string; declare: number; badges: number; ecart: number;
  couverture: number; passages: number; joursBadges: number; joursDeclares: number;
  ecartees: number; negatives: number; sites: string; comparable: boolean;
}
const lignes: Ligne[] = [];

for (const [, { agent, onglets }] of parPersonne) {
  const meilleur = onglets.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  const m = agent ? mesures.get(canonique(agent.id)) : undefined;
  const joursDeclares = meilleur.jours;
  const joursBadges = m?.jours.size ?? 0;
  const couverture = joursDeclares > 0 ? joursBadges / joursDeclares : 0;
  lignes.push({
    nom: agent ? `${agent.prenom} ${agent.nom}`.trim() : `${meilleur.onglet} (non rapproché)`,
    site: agent?.site ?? meilleur.origine,
    onglets: onglets.map((o) => o.onglet).join(" / "),
    declare: meilleur.minutes,
    badges: m?.minutes ?? 0,
    ecart: (m?.minutes ?? 0) - meilleur.minutes,
    couverture,
    passages: m?.passages ?? 0,
    joursBadges,
    joursDeclares,
    ecartees: m?.minutesEcartees ?? 0,
    negatives: onglets.reduce((s, o) => s + o.negatives, 0),
    sites: [...(m?.sites ?? [])].join("+"),
    comparable: Boolean(agent) && couverture >= COUVERTURE_MIN && (m?.pairesEcartees ?? 0) === 0,
  });
}
lignes.sort((a, b) => Number(b.comparable) - Number(a.comparable) || a.ecart - b.ecart);

const col = (s: string, n: number) => s.slice(0, n).padEnd(n);
console.log(
  col("PERSONNE", 27) + col("SITE", 9) + "  DÉCLARÉ   BADGES     ÉCART   COUV  PASS  J.B/J.D  REMARQUE",
);
console.log("─".repeat(112));
for (const l of lignes) {
  const remarques: string[] = [];
  if (!l.comparable && l.couverture < COUVERTURE_MIN) remarques.push(`couverture ${Math.round(l.couverture * 100)} %`);
  if (l.ecartees > 0) remarques.push(`${hhmm(l.ecartees)} écartées (passage manquant)`);
  if (l.negatives > 0) remarques.push(`${hhmm(l.negatives)} négatives au classeur`);
  if (l.onglets.includes("/")) remarques.push(`${l.onglets.split(" / ").length} onglets`);
  if (l.sites.includes("+")) remarques.push(`badgé à ${l.sites}`);
  console.log(
    col(l.nom, 27) +
      col(l.site, 9) +
      `${hhmm(l.declare).padStart(8)} ${hhmm(l.badges).padStart(8)} ${(l.comparable ? hhmm(l.ecart) : "—").padStart(9)}` +
      `  ${String(Math.round(l.couverture * 100)).padStart(3)}%  ${String(l.passages).padStart(4)}  ${String(l.joursBadges).padStart(3)}/${String(l.joursDeclares).padStart(3)}  ${remarques.join(" · ")}`,
  );
}

const comparables = lignes.filter((l) => l.comparable);
const ecartTotal = comparables.reduce((s, l) => s + l.ecart, 0);
console.log("─".repeat(112));
console.log(
  `\n${comparables.length} personnes comparables sur ${lignes.length} · écart cumulé ${hhmm(ecartTotal)} ` +
    `(les badges ${ecartTotal < 0 ? "voient MOINS" : "voient PLUS"} que le classeur)`,
);
console.log(
  `${lignes.length - comparables.length} non comparables : couverture insuffisante ou passage manquant — ` +
    `leur écart n'est pas totalisé, ce serait un mensonge par arithmétique.`,
);
console.log(
  `Heures négatives présentes au classeur : ${hhmm(lignes.reduce((s, l) => s + l.negatives, 0))} ` +
    `(durées calculées depuis minuit sur un badge manquant).`,
);

if (process.argv.includes("--csv")) {
  const csv = [
    "personne;site;onglets;declare_hhmm;badges_hhmm;ecart_hhmm;couverture_pct;passages;jours_badges;jours_declares;minutes_ecartees;negatives_hhmm;sites;comparable",
    ...lignes.map((l) =>
      [l.nom, l.site, l.onglets, hhmm(l.declare), hhmm(l.badges), l.comparable ? hhmm(l.ecart) : "",
        Math.round(l.couverture * 100), l.passages, l.joursBadges, l.joursDeclares, l.ecartees,
        hhmm(l.negatives), l.sites, l.comparable ? "oui" : "non"].join(";"),
    ),
  ].join("\n");
  writeFileSync("recalcul-juillet-2026.csv", csv, "utf8");
  console.log("\n→ recalcul-juillet-2026.csv");
}
