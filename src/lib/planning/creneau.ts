/* ============================================================
   PLANNING — créneaux : durées, gardes de nuit, conformité
   ============================================================

   Module PUR (aucune I/O), testable tel quel. Il répond à une question
   simple en apparence : « combien de temps dure ce créneau, et sur quelles
   heures réelles ? » — question piégeuse dès qu'un poste traverse minuit.

   ── CONVENTION CENTRALE ──────────────────────────────────────────────────
   Un créneau dont l'heure de FIN est antérieure ou égale à l'heure de DÉBUT
   traverse minuit. « 11H-8H » ne dure donc pas −3 h mais 21 h, et « 8H-8H »
   pas 0 h mais 24 h. Sans cette règle explicite, les 1 113 gardes relevées
   dans les plannings de MIARAKA seraient toutes calculées à faux.
   ============================================================ */

import { versMinutes, versHeures } from "@/lib/pointage/calcul";

export interface Creneau {
  id: string;
  libelle: string;
  type: string; // journee | fractionnee | garde_nuit | demi | repos | astreinte
  debut: string;
  fin: string;
  debut2: string;
  fin2: string;
  minutes: number;
}

/** Le créneau traverse-t-il minuit ? (fin <= début sur une plage non vide) */
export function traverseMinuit(debut: string, fin: string): boolean {
  const d = versMinutes(debut);
  const f = versMinutes(fin);
  if (d === null || f === null) return false;
  return f <= d;
}

/** Durée d'une plage en minutes, en tenant compte du passage de minuit. */
export function dureePlage(debut: string, fin: string): number {
  const d = versMinutes(debut);
  const f = versMinutes(fin);
  if (d === null || f === null) return 0;
  return f > d ? f - d : 1440 - d + f;
}

/**
 * Durée théorique d'un créneau.
 *
 * `minutes` fait foi lorsqu'il est renseigné : une garde peut inclure des
 * heures de repos non décomptées, et le barème du centre prime alors sur le
 * simple calcul d'amplitude. Sinon on somme les plages.
 */
export function dureeCreneau(c: Pick<Creneau, "type" | "debut" | "fin" | "debut2" | "fin2" | "minutes">): number {
  if (c.type === "repos") return 0;
  if (c.minutes > 0) return c.minutes;
  return dureePlage(c.debut, c.fin) + (c.debut2 && c.fin2 ? dureePlage(c.debut2, c.fin2) : 0);
}

export interface PlageAbsolue {
  /** "YYYY-MM-DD HH:MM" de début. */
  debut: string;
  /** "YYYY-MM-DD HH:MM" de fin — le lendemain si le créneau franchit minuit. */
  fin: string;
}

const ajouterJours = (jour: string, n: number): string => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Plages horaires ABSOLUES d'un créneau affecté à un jour donné : c'est ce
 * qui permet de rapprocher un pointage du lendemain 6h00 d'une garde
 * commencée la veille à 17h00, au lieu de le lire comme une journée aberrante.
 */
export function plagesDuJour(
  jour: string,
  c: Pick<Creneau, "type" | "debut" | "fin" | "debut2" | "fin2">,
): PlageAbsolue[] {
  if (c.type === "repos" || !c.debut || !c.fin) return [];
  const out: PlageAbsolue[] = [
    {
      debut: `${jour} ${c.debut}`,
      fin: `${traverseMinuit(c.debut, c.fin) ? ajouterJours(jour, 1) : jour} ${c.fin}`,
    },
  ];
  if (c.debut2 && c.fin2) {
    out.push({
      debut: `${jour} ${c.debut2}`,
      fin: `${traverseMinuit(c.debut2, c.fin2) ? ajouterJours(jour, 1) : jour} ${c.fin2}`,
    });
  }
  return out;
}

/* ── Conformité — directive 2003/88/CE ───────────────────────────────── */

export interface SeuilsLegaux {
  reposJournalierMinMinutes: number; // art. 3 — 11 h
  reposHebdoMinMinutes: number; // art. 5 — 35 h
  maxHebdoMinutes: number; // art. 6 — 48 h en moyenne
}

export const SEUILS_DEFAUT: SeuilsLegaux = {
  reposJournalierMinMinutes: 660,
  reposHebdoMinMinutes: 2100,
  maxHebdoMinutes: 2880,
};

export interface AlerteLegale {
  jour: string;
  regle: string;
  message: string;
  /** true = seuil légal franchi ; false = simple point de vigilance. */
  bloquant: boolean;
}

const minutesEntre = (finA: string, debutB: string): number => {
  const a = Date.parse(`${finA.replace(" ", "T")}:00Z`);
  const b = Date.parse(`${debutB.replace(" ", "T")}:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return (b - a) / 60000;
};

/**
 * Vérifie les repos et plafonds sur une suite de journées planifiées.
 *
 * Ces alertes se lèvent À LA SAISIE : une garde 17h-6h suivie d'une reprise
 * le lendemain matin met le repos de 11 heures en tension, et c'est au moment
 * de planifier — pas au moment de payer — qu'il faut le savoir.
 */
export function verifierSeuils(
  journees: Array<{ jour: string; plages: PlageAbsolue[]; minutes: number }>,
  seuils: SeuilsLegaux = SEUILS_DEFAUT,
): AlerteLegale[] {
  const alertes: AlerteLegale[] = [];
  const tri = [...journees].sort((a, b) => a.jour.localeCompare(b.jour));

  // Repos journalier entre la fin d'un service et la prise du suivant.
  for (let i = 0; i < tri.length - 1; i++) {
    const fins = tri[i].plages.map((p) => p.fin).sort();
    const debuts = tri[i + 1].plages.map((p) => p.debut).sort();
    if (!fins.length || !debuts.length) continue;
    const repos = minutesEntre(fins[fins.length - 1], debuts[0]);
    if (repos < seuils.reposJournalierMinMinutes) {
      alertes.push({
        jour: tri[i + 1].jour,
        regle: "repos_journalier",
        message: `Repos de ${versHeures(Math.max(0, repos))} entre deux services — le minimum légal est de ${versHeures(seuils.reposJournalierMinMinutes)} (directive 2003/88/CE, art. 3).`,
        bloquant: true,
      });
    }
  }

  // Plafond hebdomadaire, par semaine ISO glissante de 7 jours.
  for (let i = 0; i < tri.length; i++) {
    const fenetre = tri.slice(i, i + 7);
    if (fenetre.length < 7) break;
    const total = fenetre.reduce((s, j) => s + j.minutes, 0);
    if (total > seuils.maxHebdoMinutes) {
      alertes.push({
        jour: fenetre[0].jour,
        regle: "max_hebdomadaire",
        message: `${versHeures(total)} sur 7 jours consécutifs à partir du ${fenetre[0].jour} — le plafond est de ${versHeures(seuils.maxHebdoMinutes)} (directive 2003/88/CE, art. 6).`,
        bloquant: true,
      });
    }
    // Repos hebdomadaire : la plus longue coupure de la fenêtre.
    let plusLongue = 0;
    for (let k = 0; k < fenetre.length - 1; k++) {
      const fins = fenetre[k].plages.map((p) => p.fin).sort();
      const debuts = fenetre[k + 1].plages.map((p) => p.debut).sort();
      if (!fins.length || !debuts.length) {
        plusLongue = Math.max(plusLongue, seuils.reposHebdoMinMinutes);
        continue;
      }
      plusLongue = Math.max(plusLongue, minutesEntre(fins[fins.length - 1], debuts[0]));
    }
    if (plusLongue < seuils.reposHebdoMinMinutes) {
      alertes.push({
        jour: fenetre[0].jour,
        regle: "repos_hebdomadaire",
        message: `Aucun repos de ${versHeures(seuils.reposHebdoMinMinutes)} consécutives sur la semaine du ${fenetre[0].jour} (directive 2003/88/CE, art. 5).`,
        bloquant: false,
      });
    }
  }

  return alertes;
}

/**
 * Analyse une écriture de créneau telle qu'elle figure dans les plannings
 * Excel (« 11H-8H », « 07:00H-12H\n14H-16H30 », « 8h-11h\nAnkofafa »…).
 *
 * Les fichiers ne sont normalisés en rien : quatre écritures d'heure
 * coexistent (7H, 07H, 07:00H, 8h), les espaces autour du tiret sont
 * aléatoires, et le lieu est collé au créneau par un retour ligne. Cette
 * fonction rend ce qu'elle a compris, sans jamais deviner : une écriture
 * non reconnue ressort en `brut` pour arbitrage humain plutôt que
 * silencieusement convertie en zéro heure.
 */
export interface CreneauAnalyse {
  plages: Array<{ debut: string; fin: string }>;
  lieu: string;
  repos: boolean;
  brut: string;
  reconnu: boolean;
}

/**
 * Mots marquant un jour non travaillé. Le test se fait sur une forme SANS
 * ACCENTS : les fichiers contiennent cinq orthographes de « férié »
 * (feriè, ferié, férié, Férié, FERIE) et six de « congé ». Énumérer les
 * variantes serait sans fin ; on retire les diacritiques une bonne fois.
 */
const MOTS_REPOS = /^(repos|conges?|feries?|maternites?|absente?|vacances?)/;
const sansAccents = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function analyserEcriture(texte: string): CreneauAnalyse {
  const brut = String(texte ?? "").trim();
  const res: CreneauAnalyse = { plages: [], lieu: "", repos: false, brut, reconnu: false };
  if (!brut) return res;

  // Le retour ligne sépare soit deux plages, soit une plage et un lieu.
  const morceaux = brut.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
  const normaliseHeure = (h: string, m?: string) => `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
  // « 7H-12H », « 07:00H-12H », « 8h - 11h30 », « 14H -16H »
  const RX = /(\d{1,2})\s*(?::\s*(\d{2}))?\s*[Hh]?\s*(\d{2})?\s*-\s*(\d{1,2})\s*(?::\s*(\d{2}))?\s*[Hh]{1,2}\s*(\d{2})?/;

  for (const mo of morceaux) {
    if (MOTS_REPOS.test(sansAccents(mo))) {
      res.repos = true;
      res.reconnu = true;
      continue;
    }
    const m = RX.exec(mo);
    if (m) {
      res.plages.push({
        debut: normaliseHeure(m[1], m[2] ?? m[3]),
        fin: normaliseHeure(m[4], m[5] ?? m[6]),
      });
      res.reconnu = true;
      // Ce qui suit la plage sur la même ligne est un lieu (« 06H-18H REX »).
      const reste = mo.slice(m.index + m[0].length).trim();
      if (reste && !res.lieu) res.lieu = reste;
    } else if (!res.lieu) {
      res.lieu = mo;
    }
  }
  return res;
}
