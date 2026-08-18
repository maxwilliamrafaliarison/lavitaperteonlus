#!/usr/bin/env node
/**
 * MODIFICATION DU PLANNING MIARAKA — vacances des enfants, 15 au 20 août 2026.
 *
 * Une feuille d'une page, remise par la direction, qui REMPLACE ce qui était
 * prévu pour cinq personnes sur six jours. Ce n'est pas un planning neuf :
 * c'est un amendement, et il doit s'appliquer comme tel — en écrasant les
 * affectations existantes de ces (personne, jour) là, et rien d'autre.
 *
 * ── CE QUI EST ARBITRÉ ───────────────────────────────────────────────────
 * Les horaires de la feuille se rangent presque tous dans un créneau connu.
 * Deux ne s'y rangent pas — « 8H-14H » et « 08H-16H30 » — et prennent donc
 * le créneau « horaire personnalisé » avec leurs bornes écrites sur
 * l'affectation. C'est exactement ce que ce créneau existe pour porter :
 * inventer deux modèles pour deux journées uniques encombrerait la liste
 * que la RH voit à chaque clic.
 *
 * Les mentions de la feuille — « SUIVIE TRAVAUX ANKOFAFA ET ACHAT
 * FOURNITURES ET TENUES SCOLAIRES », « rentré des filles » — ne sont pas
 * décoratives : elles disent POURQUOI la journée change. Elles sont
 * conservées en note sur l'affectation, seul endroit où quelqu'un les
 * retrouvera dans six mois.
 *
 * Usage :
 *   npx tsx scripts/modif-planning-vacances.mts            # simulation
 *   npx tsx scripts/modif-planning-vacances.mts --apply
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
  const h: Record<string, string> = { apikey: K, Authorization: `Bearer ${K}`, "Accept-Profile": "planning" };
  if (ecrit) {
    h["Content-Type"] = "application/json";
    h["Content-Profile"] = "planning";
    h.Prefer = "return=minimal";
  }
  return h;
};
async function lire<T>(path: string): Promise<T[]> {
  const r = await fetch(`${U}/rest/v1/${path}`, { headers: H() });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.json();
}
async function ecrire(path: string, body: unknown, methode = "PATCH") {
  const r = await fetch(`${U}/rest/v1/${path}`, {
    method: methode,
    headers: H(true),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${methode} ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
}

/** Les cinq personnes de la feuille, arbitrées sur le référentiel. */
const QUI: Record<string, string> = {
  Feno: "AG-MIARAKA-21", // PHILBERT HERIFENOSOA
  Anico: "AG-MIARAKA-30", // HERIMALALA JEREMIA ANICO RAJAONARIVELO
  Fanja: "AG-REX-40", // MARIE CLAIRE RAFANJANIRINA (fiche réunie le 13/08)
  Lalao: "AG-REX-22", // TINALALAO NIRINA RAKOTOARIMALALA
  Diamondra: "AG-REX-31", // DIAMONDRA ADAHIMASIPANIRY
};

/** La feuille, recopiée telle quelle — la note en second champ. */
const FEUILLE: Array<[string, Record<string, string>]> = [
  ["2026-08-15", { Feno: "8H-8H", Anico: "8H-8H", Fanja: "Repos", Lalao: "8h-12H", Diamondra: "8H-8H" }],
  ["2026-08-16", { Feno: "8H-8H", Anico: "8H-8H", Fanja: "Repos", Lalao: "Repos", Diamondra: "8H-8H" }],
  ["2026-08-17", { Feno: "8H-8H", Anico: "8H-8H", Fanja: "16H-8H", Lalao: "8H-12H + 14H-17H|SUIVIE TRAVAUX ANKOFAFA ET ACHAT FOURNITURES ET TENUES SCOLAIRES", Diamondra: "08H-16H30" }],
  ["2026-08-18", { Feno: "8H-8H", Anico: "8H-8H", Fanja: "8H-8H", Lalao: "8H-12H + 14H-17H|SUIVIE TRAVAUX ANKOFAFA ET ACHAT FOURNITURES ET TENUES SCOLAIRES", Diamondra: "Repos" }],
  ["2026-08-19", { Feno: "8H-8H", Anico: "8H-14H", Fanja: "8H-14H", Lalao: "Repos", Diamondra: "8H-8H|SUIVIE TRAVAUX ANKOFAFA ET ACHAT FOURNITURES ET TENUES SCOLAIRES + rentrée des filles" }],
  ["2026-08-20", { Feno: "Repos", Anico: "Repos", Fanja: "8H-8H", Lalao: "8H-8H", Diamondra: "Repos" }],
];

/** Horaire écrit → créneau du catalogue, avec bornes si personnalisé. */
function traduire(horaire: string): { creneau: string; debut: string; fin: string } | null {
  const h = horaire.trim().toUpperCase().replace(/\s+/g, " ");
  const table: Record<string, { creneau: string; debut: string; fin: string }> = {
    "8H-8H": { creneau: "g_8_8", debut: "", fin: "" },
    "16H-8H": { creneau: "g_16_8", debut: "", fin: "" },
    "8H-12H": { creneau: "matin", debut: "", fin: "" },
    "8H-12H + 14H-17H": { creneau: "std", debut: "", fin: "" },
    REPOS: { creneau: "repos", debut: "", fin: "" },
    // Deux journées uniques : le créneau « horaire personnalisé » les porte.
    "8H-14H": { creneau: "libre", debut: "08:00", fin: "14:00" },
    "08H-16H30": { creneau: "libre", debut: "08:00", fin: "16:30" },
  };
  return table[h] ?? null;
}

// ── Le planning qui couvre la période ─────────────────────────────────────
const plannings = await lire<{ id: string; du: string; au: string; centre: string }>(
  "plannings?select=id,du,au,centre&centre=eq.MIARAKA&order=du.desc",
);
const cible = plannings.find((p) => p.du <= "2026-08-15" && p.au >= "2026-08-20");
if (!cible) {
  console.error("❌ Aucun planning MIARAKA ne couvre le 15 au 20 août.");
  process.exit(1);
}
console.log(`Planning visé : ${cible.id} (${cible.du} → ${cible.au})\n`);

const existantes = await lire<{ id: string; agent_id: string; jour: string; creneau_id: string; debut: string; fin: string; note: string }>(
  `affectations?select=id,agent_id,jour,creneau_id,debut,fin,note&planning_id=eq.${cible.id}&and=(jour.gte.2026-08-15,jour.lte.2026-08-20)`,
);
const parCle = new Map(existantes.map((a) => [`${a.agent_id}|${a.jour}`, a]));

interface Geste { agentId: string; nom: string; jour: string; avant: string; apres: string; creneau: string; debut: string; fin: string; note: string; id?: string }
const gestes: Geste[] = [];
const inconnus: string[] = [];

for (const [jour, cellules] of FEUILLE) {
  for (const [nom, brut] of Object.entries(cellules)) {
    const agentId = QUI[nom];
    if (!agentId) { inconnus.push(nom); continue; }
    const [horaire, note = ""] = brut.split("|");
    const t = traduire(horaire);
    if (!t) { inconnus.push(`${nom} ${jour} « ${horaire} »`); continue; }
    const deja = parCle.get(`${agentId}|${jour}`);
    gestes.push({
      agentId, nom, jour,
      avant: deja ? `${deja.creneau_id}${deja.debut ? ` ${deja.debut}–${deja.fin}` : ""}` : "(rien)",
      apres: `${t.creneau}${t.debut ? ` ${t.debut}–${t.fin}` : ""}`,
      creneau: t.creneau, debut: t.debut, fin: t.fin, note,
      id: deja?.id,
    });
  }
}

const JOURS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
const nomJour = (j: string) => JOURS[new Date(`${j}T12:00:00Z`).getUTCDay()];
console.log("PERSONNE      JOUR         AVANT             →  APRÈS");
for (const g of gestes) {
  const change = g.avant !== g.apres;
  console.log(
    `${g.nom.padEnd(12)} ${nomJour(g.jour)} ${g.jour.slice(8)}/08  ${g.avant.padEnd(17)} ${change ? "→" : "="}  ${g.apres}` +
      (g.note ? `   « ${g.note.slice(0, 46)}… »` : ""),
  );
}
const modifs = gestes.filter((g) => g.avant !== g.apres).length;
console.log(`\n${gestes.length} cellules · ${modifs} réellement modifiées · ${gestes.filter((g) => !g.id).length} à créer`);
if (inconnus.length) console.log(`⚠ non traduits : ${inconnus.join(" · ")}`);

if (!APPLY) {
  console.log("\n(simulation — relancez avec --apply)");
  process.exit(0);
}

let maj = 0, cree = 0;
for (const g of gestes) {
  const corps = {
    creneau_id: g.creneau,
    debut: g.debut,
    fin: g.fin,
    note: g.note ? `Vacances des enfants — ${g.note}` : "Vacances des enfants (modification du 13/08/2026)",
  };
  if (g.id) {
    await ecrire(`affectations?id=eq.${g.id}`, corps);
    maj += 1;
  } else {
    await ecrire(
      "affectations",
      [{
        id: `AFF-${cible.id}-${g.jour.replace(/-/g, "")}-${g.agentId}-x`,
        planning_id: cible.id,
        agent_id: g.agentId,
        jour: g.jour,
        service_id: "",
        lieu: "",
        ...corps,
      }],
      "POST",
    );
    cree += 1;
  }
}
console.log(`✅ ${maj} affectation(s) modifiée(s) · ${cree} créée(s)`);

const apres = await lire<{ agent_id: string; jour: string; creneau_id: string; debut: string; fin: string }>(
  `affectations?select=agent_id,jour,creneau_id,debut,fin&planning_id=eq.${cible.id}&and=(jour.gte.2026-08-15,jour.lte.2026-08-20)&order=jour.asc`,
);
console.log(`Vérification : ${apres.length} affectations sur la période pour l'ensemble du centre.`);
for (const g of gestes) {
  const a = apres.find((x) => x.agent_id === g.agentId && x.jour === g.jour);
  const rendu = a ? `${a.creneau_id}${a.debut ? ` ${a.debut}–${a.fin}` : ""}` : "MANQUANTE";
  if (rendu !== g.apres) console.log(`   ⚠ ${g.nom} ${g.jour} → ${rendu} (attendu ${g.apres})`);
}
