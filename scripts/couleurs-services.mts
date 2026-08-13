#!/usr/bin/env node
/**
 * COULEURS DES SERVICES — et réparation de deux libellés mal décodés.
 *
 * La colonne `planning.services.couleur` existait depuis la migration 014 et
 * n'a jamais été remplie ni lue. La grille colore aujourd'hui par TYPE de
 * créneau — journée, garde, demi-journée — ce qui répond à « quelle forme de
 * poste ? » mais jamais à « quel service ? ». Deux lectures utiles de la
 * même grille, et l'une manquait faute d'une colonne remplie.
 *
 * ── POURQUOI DES TEINTES CALCULÉES, ET NON CHOISIES ──────────────────────
 * Vingt-et-un services à REX : choisir vingt-et-une couleurs à la main
 * donne fatalement deux verts voisins qu'on ne distingue pas. On répartit
 * donc les teintes sur le cercle chromatique par un pas de 137,5° — l'angle
 * d'or, qui maximise l'écart entre teintes successives quel qu'en soit le
 * nombre. Les services voisins dans la liste tombent ainsi aux antipodes.
 *
 * La luminosité et la saturation restent FIXES : c'est ce qui garantit que
 * le texte blanc reste lisible sur toutes, et qu'aucune couleur ne hurle
 * plus fort qu'une autre. Une couleur qui attire l'œil sans raison est un
 * mensonge visuel.
 *
 * La valeur est écrite en base, donc modifiable : ces teintes sont un point
 * de départ raisonnable, pas une décision définitive.
 *
 * ── LES DEUX LIBELLÉS ABÎMÉS ─────────────────────────────────────────────
 * « Gyn√©cologie » et une note de paramètre portent la signature d'un texte
 * UTF-8 relu comme du Latin-1, quelque part entre le fichier d'origine et la
 * base. On les réécrit ; l'origine est en amont et ne se corrige pas ici.
 *
 * Usage :
 *   npx tsx scripts/couleurs-services.mts            # simulation
 *   npx tsx scripts/couleurs-services.mts --apply
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
async function ecrire(path: string, body: unknown) {
  const r = await fetch(`${U}/rest/v1/${path}`, { method: "PATCH", headers: H(true), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status} ${(await r.text()).slice(0, 160)}`);
}

/** Angle d'or : le pas qui écarte le mieux N teintes, quel que soit N. */
const PAS = 137.508;
/** Une teinte de service, en OKLCH — clarté et chroma constants. */
export const teinteService = (n: number) => `oklch(0.62 0.14 ${((n * PAS) % 360).toFixed(1)})`;

interface Service { id: string; libelle: string; centre: string; rang: number; couleur: string }
const services = await lire<Service>("services?select=id,libelle,centre,rang,couleur&order=centre.asc,rang.asc&limit=200");

/* La teinte suit l'ORDRE D'AFFICHAGE, pas l'identifiant : deux services
   voisins à l'écran doivent se distinguer, deux services éloignés peuvent
   se ressembler sans gêner personne. */
const aEcrire = services
  .map((s, i) => ({ ...s, nouvelle: teinteService(i) }))
  .filter((s) => !s.couleur);

const REPARATIONS: Array<{ table: string; filtre: string; champ: string; avant: string; apres: string }> = [
  { table: "services", filtre: "id=eq.gyneco", champ: "libelle", avant: "Gyn√©cologie", apres: "Gynécologie" },
  {
    table: "parametres",
    filtre: "cle=eq.quota_mensuel_minutes",
    champ: "note",
    avant: "r√©f√©rence √†",
    apres: "référence à",
  },
];

console.log(`${services.length} services · ${aEcrire.length} sans couleur`);
for (const s of aEcrire.slice(0, 24)) {
  console.log(`   ${s.centre.padEnd(8)} ${s.libelle.slice(0, 30).padEnd(32)} ${s.nouvelle}`);
}
console.log(`\n${REPARATIONS.length} libellé(s) à réparer :`);
for (const r of REPARATIONS) console.log(`   ${r.table}.${r.champ} : « ${r.avant} » → « ${r.apres} »`);

if (!APPLY) {
  console.log("\n(simulation — relancez avec --apply)");
  process.exit(0);
}

for (const s of aEcrire) await ecrire(`services?id=eq.${s.id}`, { couleur: s.nouvelle });
console.log(`✅ ${aEcrire.length} couleur(s) écrite(s)`);

for (const r of REPARATIONS) {
  const [ligne] = await lire<Record<string, string>>(`${r.table}?select=${r.champ}&${r.filtre}`);
  if (!ligne) continue;
  const valeur = String(ligne[r.champ] ?? "");
  if (!valeur.includes(r.avant)) continue;
  await ecrire(`${r.table}?${r.filtre}`, { [r.champ]: valeur.replaceAll(r.avant, r.apres) });
  console.log(`✅ ${r.table}.${r.champ} réparé`);
}

const apres = await lire<Service>("services?select=id,couleur&limit=200");
console.log(`Vérification : ${apres.filter((s) => s.couleur).length}/${apres.length} services colorés.`);
