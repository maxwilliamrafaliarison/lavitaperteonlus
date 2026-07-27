/* ============================================================
   PLANNING MIARAKA — lecture des feuilles mensuelles
   ============================================================

   Module PUR. Une feuille = un mois, en MATRICE : les agents occupent les
   colonnes, les jours les lignes, par blocs de semaine.

   ── LA DIFFICULTÉ PROPRE À CE FORMAT : RECONSTITUER LES DATES ────────────
   Les cellules ne portent que le NUMÉRO du jour (1, 2, … 31) et son
   abréviation (« lun », « mar »). Ni mois ni année. Or un bloc de semaine
   chevauche régulièrement deux mois (« 31 lun » suivi de « 1 mar »), et le
   nom d'onglet est approximatif (« aout 26 » couvre du 27/07 au 06/09).

   La reconstitution s'appuie donc sur deux repères qui se contrôlent
   mutuellement : le mois de départ déduit du nom de feuille, et le JOUR DE
   SEMAINE écrit en clair. Quand le numéro décroît, on change de mois ; et
   si le jour de semaine obtenu ne correspond pas à celui annoncé, on le
   signale au lieu d'enregistrer une date fausse.
   ============================================================ */

import { analyserEcriture } from "./creneau";

export interface AffectationMiaraka {
  jour: string; // "YYYY-MM-DD"
  agent: string; // prénom tel qu'écrit en en-tête de colonne
  ecriture: string; // la cellule d'origine, conservée pour audit
  plages: Array<{ debut: string; fin: string }>;
  lieu: string;
  repos: boolean;
  reconnu: boolean;
}

export interface MoisMiaraka {
  feuille: string;
  agents: string[];
  jours: string[];
  affectations: AffectationMiaraka[];
  anomalies: string[];
}

const MOIS: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1,
  fevrier: 2, fev: 2, feb: 2,
  mars: 3, mar: 3,
  avril: 4, avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7, juil: 7,
  aout: 8, aou: 8,
  septembre: 9, sept: 9, sep: 9,
  octobre: 10, oct: 10,
  novembre: 11, nov: 11,
  decembre: 12, dec: 12,
};

const JOURS_ABREGES: Record<string, number> = {
  dim: 0, lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6,
};

const sansAccents = (s: string) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Déduit le mois et l'année de départ depuis un nom de feuille :
 * « janvier 26 », « Fev26 », « aout 26 », « Sec Janv », « DEC25 ».
 */
export function moisDeLaFeuille(nom: string): { mois: number; annee: number } | null {
  const s = sansAccents(nom).replace(/[^a-z0-9]/g, " ");
  let mois = 0;
  for (const [cle, val] of Object.entries(MOIS)) {
    // On prend la correspondance la plus longue (« juillet » avant « juil »).
    if (new RegExp(`\\b${cle}`).test(s) && cle.length > (mois ? String(mois).length : 0)) {
      const dejaTrouve = Object.entries(MOIS).find(([c, v]) => v === mois && c.length >= cle.length);
      if (!mois || !dejaTrouve) mois = val;
    }
  }
  if (!mois) return null;
  // L'année est un nombre à deux chiffres, tantôt collé au mois (« DEC25 »,
  // « Fev26 »), tantôt séparé (« janvier 26 »), et parfois suivi d'un indice
  // de doublon (« AVRIL 25 1 », « JUIN 25 (3) »). On ne retient donc que les
  // valeurs plausibles comme millésime : chercher « deux chiffres en fin de
  // chaîne » daterait « AVRIL 25 1 » de 2001.
  const annees = [...sansAccents(nom).matchAll(/(\d{2})/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 24 && n <= 30);
  return { mois, annee: annees.length ? 2000 + annees[0] : 2026 };
}

/** Le jour de semaine calculé correspond-il à celui écrit ? */
function coherent(jour: string, abrege: string): boolean {
  const attendu = JOURS_ABREGES[sansAccents(abrege).slice(0, 3)];
  if (attendu === undefined) return true;
  return new Date(`${jour}T12:00:00Z`).getUTCDay() === attendu;
}

const iso = (annee: number, mois: number, jour: number) =>
  `${annee}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;

const norm = (v: unknown) => String(v ?? "").replace(/\r/g, "").trim();

/**
 * Analyse une feuille mensuelle.
 *
 * Une ligne est une LIGNE DE JOUR si sa colonne A porte un numéro de 1 à 31
 * et sa colonne B une abréviation de jour. Tout le reste — en-têtes de bloc,
 * lignes de total, blocs de synthèse — est ignoré : les totaux du fichier
 * sont des constantes tapées à la main, désynchronisées des créneaux, et les
 * reprendre importerait des chiffres faux.
 */
export function parserFeuilleMiaraka(nomFeuille: string, lignes: unknown[][]): MoisMiaraka {
  const anomalies: string[] = [];
  const affectations: AffectationMiaraka[] = [];
  const joursVus: string[] = [];

  const depart = moisDeLaFeuille(nomFeuille);
  if (!depart) {
    return { feuille: nomFeuille, agents: [], jours: [], affectations: [], anomalies: [`Feuille « ${nomFeuille} » : mois indéterminable.`] };
  }

  let mois = depart.mois;
  let annee = depart.annee;
  let precedent = 0;
  let colonnes: string[] = []; // index de colonne → prénom d'agent
  const tousAgents = new Set<string>();

  for (const r of lignes) {
    if (!r) continue;
    const a = norm(r[0]);
    const b = norm(r[1]);

    // En-tête de bloc : la colonne B est vide et des prénoms suivent.
    const numero = Number(a);
    const estLigneJour = Number.isInteger(numero) && numero >= 1 && numero <= 31 && JOURS_ABREGES[sansAccents(b).slice(0, 3)] !== undefined;

    if (!estLigneJour) {
      const noms = r.slice(2).map((c) => norm(c));
      // Un en-tête compte au moins deux libellés courts sans chiffre. Les
      // noms de mois sont exclus : les blocs portent « JUILLET/AOUT » ou
      // « DECEMBRE/janvier » en tête, et les prendre pour des agents crée
      // des colonnes fantômes qui absorbent de vraies affectations.
      const estMois = (n: string) => {
        const s = sansAccents(n).replace(/[^a-z]/g, " ").trim();
        return s.split(/\s+/).every((mot) => mot.length > 2 && mot in MOIS);
      };
      const candidats = noms.filter((n) => n && n.length <= 20 && !/\d/.test(n) && !estMois(n));
      if (candidats.length >= 2 && !/total|conge|difference|heure/i.test(sansAccents(noms.join(" ")))) {
        colonnes = noms.map((n) => (n && !estMois(n) ? n : ""));
        colonnes.forEach((n) => n && tousAgents.add(n));
      }
      continue;
    }

    if (precedent === 0) {
      // PREMIER JOUR : le nom d'onglet ne suffit pas. Une feuille « aout 26 »
      // commence au 27 juillet, parce que le bloc de semaine chevauche les
      // mois. On cherche donc, parmi le mois annoncé et ses voisins, celui
      // qui rend le jour de semaine écrit exact — c'est le seul repère sûr.
      const candidats = [
        { m: mois, a: annee },
        { m: mois === 1 ? 12 : mois - 1, a: mois === 1 ? annee - 1 : annee },
        { m: mois === 12 ? 1 : mois + 1, a: mois === 12 ? annee + 1 : annee },
      ];
      const bon = candidats.find((c) => coherent(iso(c.a, c.m, numero), b));
      if (bon) {
        mois = bon.m;
        annee = bon.a;
      }
    } else if (numero < precedent) {
      // Le numéro décroît → on a changé de mois.
      mois++;
      if (mois > 12) {
        mois = 1;
        annee++;
      }
    }
    precedent = numero;

    const jour = iso(annee, mois, numero);
    if (!coherent(jour, b)) {
      anomalies.push(`Feuille « ${nomFeuille} » : le ${jour} n'est pas un « ${b} » — reconstitution de date à vérifier.`);
      continue;
    }
    if (!joursVus.includes(jour)) joursVus.push(jour);

    for (let c = 2; c < r.length; c++) {
      const agent = colonnes[c - 2];
      const ecriture = norm(r[c]);
      if (!agent || !ecriture) continue;
      const an = analyserEcriture(ecriture);
      affectations.push({
        jour,
        agent,
        ecriture,
        plages: an.plages,
        lieu: an.lieu,
        repos: an.repos,
        reconnu: an.reconnu,
      });
    }
  }

  return {
    feuille: nomFeuille,
    agents: [...tousAgents],
    jours: joursVus,
    affectations,
    anomalies,
  };
}
