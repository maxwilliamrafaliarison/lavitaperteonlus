import { jourSemaine } from "./calcul";

/* ============================================================
   ABSENCES ET CONGÉS — moteur de calcul
   ============================================================

   Module PUR : aucune entrée-sortie, aucun accès à la base. Il ne connaît
   que des chaînes "YYYY-MM-DD" et des nombres, ce qui le rend testable au
   cas près, et c'est indispensable ici : une erreur d'un jour dans un
   décompte de congé se retrouve sur un bulletin de paie.

   ── POURQUOI LE MODE DE DÉCOMPTE EST UN PARAMÈTRE ────────────────────────
   Le Code du travail malgache (loi 2003-044, art. 86) ouvre droit à deux
   jours et demi de congé payé par mois de service effectif, exprimés en
   jours CALENDAIRES : dans une semaine de congé, le dimanche est décompté
   comme les autres. Beaucoup d'employeurs comptent pourtant en jours
   OUVRÉS, ce qui est plus favorable au salarié et plus simple à expliquer.

   Les deux usages existent et l'ONG doit pouvoir trancher sans qu'on
   retouche le code. Le mode est donc porté par les paramètres, avec le
   décompte légal par défaut : c'est celui qu'un contrôle opposerait.

   Les jours fériés, eux, ne sont JAMAIS décomptés dans l'un ou l'autre
   mode. Un férié tombant pendant un congé est un jour chômé payé, pas un
   jour de congé consommé ; le décompter reviendrait à faire payer au
   salarié un droit que la loi lui accorde par ailleurs.
   ============================================================ */

/** Nature d'une absence. Les libellés vivent dans `LIBELLES_NATURE`. */
export type NatureAbsence =
  | "conge" // congé payé, décompté du solde
  | "maladie" // arrêt maladie, justificatif attendu
  | "maternite"
  | "mission" // déplacement pour le centre : travail, pas absence
  | "ferie" // jour chômé décidé par le centre
  | "sans_solde"
  | "injustifiee";

export const NATURES: NatureAbsence[] = [
  "conge",
  "maladie",
  "maternite",
  "mission",
  "ferie",
  "sans_solde",
  "injustifiee",
];

/**
 * Ce que chaque nature entraîne. Un tableau plutôt que des `if` éparpillés :
 * ajouter une nature demande alors une ligne, et non une chasse aux
 * conditions oubliées dans quatre fichiers.
 */
export interface RegleNature {
  libelle: string;
  /** Retranchée du solde de congés payés. */
  decompteSolde: boolean;
  /** Justificatif attendu (arrêt de travail, ordre de mission…). */
  justificatifAttendu: boolean;
  /** La personne travaille : une mission n'est pas une absence du travail,
   *  seulement une absence du centre. Le temps reste dû. */
  compteCommeTravail: boolean;
  /** Neutralise retards, départs anticipés et alertes « sans badge ». */
  neutraliseEcarts: boolean;
}

export const REGLES: Record<NatureAbsence, RegleNature> = {
  conge: {
    libelle: "Congé payé",
    decompteSolde: true,
    justificatifAttendu: false,
    compteCommeTravail: false,
    neutraliseEcarts: true,
  },
  maladie: {
    libelle: "Maladie",
    decompteSolde: false,
    justificatifAttendu: true,
    compteCommeTravail: false,
    neutraliseEcarts: true,
  },
  maternite: {
    libelle: "Maternité",
    decompteSolde: false,
    justificatifAttendu: true,
    compteCommeTravail: false,
    neutraliseEcarts: true,
  },
  mission: {
    libelle: "Mission",
    decompteSolde: false,
    justificatifAttendu: false,
    compteCommeTravail: true,
    neutraliseEcarts: true,
  },
  ferie: {
    libelle: "Jour férié",
    decompteSolde: false,
    justificatifAttendu: false,
    compteCommeTravail: false,
    neutraliseEcarts: true,
  },
  sans_solde: {
    libelle: "Congé sans solde",
    decompteSolde: false,
    justificatifAttendu: false,
    compteCommeTravail: false,
    neutraliseEcarts: true,
  },
  injustifiee: {
    libelle: "Absence injustifiée",
    decompteSolde: false,
    justificatifAttendu: false,
    compteCommeTravail: false,
    // Seule nature à NE PAS neutraliser : c'est précisément l'anomalie
    // qu'on veut continuer de voir, désormais qualifiée au lieu de rester
    // un « sans badge » muet.
    neutraliseEcarts: false,
  },
};

export function estNature(v: string): v is NatureAbsence {
  return (NATURES as string[]).includes(v);
}

export function libelleNature(v: string): string {
  return estNature(v) ? REGLES[v].libelle : v || "Absence";
}

/** États d'une demande. Une absence passée peut naître directement acceptée. */
export type EtatAbsence = "demande" | "acceptee" | "refusee" | "annulee";

export const LIBELLES_ETAT: Record<EtatAbsence, string> = {
  demande: "En attente",
  acceptee: "Acceptée",
  refusee: "Refusée",
  annulee: "Annulée",
};

/** Seule une absence acceptée produit des effets sur le pointage. */
export function estActive(etat: string): boolean {
  return etat === "acceptee";
}

/* ── Dates ────────────────────────────────────────────────────────────── */

/** Tous les jours civils de `du` à `au`, bornes incluses. */
export function joursDePeriode(du: string, au: string): string[] {
  if (!du || !au || au < du) return [];
  const out: string[] = [];
  const d = new Date(`${du}T12:00:00Z`);
  const fin = new Date(`${au}T12:00:00Z`);
  // Garde-fou : une période aberrante (dix ans) ne doit pas faire tourner
  // la boucle indéfiniment ni saturer la mémoire du serveur.
  for (let i = 0; d <= fin && i < 3660; i += 1) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Deux périodes fermées se recouvrent-elles ? */
export function chevauche(
  a: { du: string; au: string },
  b: { du: string; au: string },
): boolean {
  return a.du <= b.au && b.du <= a.au;
}

export type ModeDecompte = "calendaire" | "ouvre";

export interface OptionsDecompte {
  /** "calendaire" (défaut légal) ou "ouvre". */
  mode?: ModeDecompte;
  /** Jours travaillés de l'agent, 1 = lundi … 7 = dimanche. */
  joursTravailles?: number[];
  /** Jours fériés du centre ("YYYY-MM-DD"), jamais décomptés. */
  feries?: Iterable<string>;
}

/**
 * Nombre de jours réellement décomptés sur une période.
 *
 * En mode calendaire, tous les jours comptent sauf les fériés. En mode
 * ouvré, seuls les jours travaillés par l'agent comptent, fériés déduits.
 */
export function compterJours(du: string, au: string, options: OptionsDecompte = {}): number {
  const mode = options.mode ?? "calendaire";
  const feries = new Set(options.feries ?? []);
  const ouvres = options.joursTravailles ?? [1, 2, 3, 4, 5, 6];
  let n = 0;
  for (const j of joursDePeriode(du, au)) {
    if (feries.has(j)) continue;
    if (mode === "ouvre" && !ouvres.includes(jourSemaine(j))) continue;
    n += 1;
  }
  return n;
}

/* ── Solde ────────────────────────────────────────────────────────────── */

/** Droit acquis par mois de service, valeur légale malgache. */
export const ACQUISITION_PAR_MOIS = 2.5;

/** Nombre de jours du mois `m` (1-12) de l'année `a`. */
function joursDuMois(a: number, m: number): number {
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/**
 * Mois de service ENTIERS entre deux dates.
 *
 * Le droit s'ouvre par mois révolu : entré le 15 mars, l'agent a un mois de
 * service le 15 avril, pas le 1er avril.
 *
 * ── LE CAS DU 31 ─────────────────────────────────────────────────────────
 * Une personne entrée un 31 janvier a bien un mois de service le 28 février,
 * puisque février n'a pas de 31. Comparer les quantièmes bruts lui refusait
 * ce mois, et le suivant, et ainsi de suite : elle perdait un mois de droit
 * chaque année où le calcul tombait sur un mois court. Le quantième
 * d'anniversaire est donc ramené au dernier jour du mois d'arrivée.
 */
export function moisDeService(dateEntree: string, jusquA: string): number {
  if (!dateEntree || !jusquA || jusquA < dateEntree) return 0;
  const [ae, me, je] = dateEntree.split("-").map(Number);
  const [aj, mj, jj] = jusquA.split("-").map(Number);
  if ([ae, me, je, aj, mj, jj].some((n) => !Number.isFinite(n))) return 0;
  let mois = (aj - ae) * 12 + (mj - me);
  const anniversaire = Math.min(je, joursDuMois(aj, mj));
  if (jj < anniversaire) mois -= 1; // le mois en cours n'est pas révolu
  return Math.max(0, mois);
}

/**
 * Mois CIVILS entièrement contenus dans une période.
 *
 * ── POURQUOI CE COMPTEUR N'EST PAS `moisDeService` ───────────────────────
 * `moisDeService` compte des anniversaires, ce qui est juste pour mesurer
 * l'ancienneté d'une personne entrée le 15 mars. L'acquisition sur un
 * exercice pose une autre question : combien de mois entiers la personne
 * a-t-elle servis entre l'ouverture de l'exercice et aujourd'hui.
 *
 * La différence se voit à la clôture. Du 1er janvier au 31 décembre,
 * l'anniversaire ne compte que ONZE mois, le douzième ne se refermant que
 * le 1er janvier suivant : une personne ayant travaillé l'année entière
 * n'aurait jamais atteint ses trente jours, ce qui est faux et se serait
 * vu sur chaque bulletin. Douze mois civils sont pourtant bien complets.
 */
export function moisComplets(du: string, au: string): number {
  if (!du || !au || au < du) return 0;
  let annee = Number(du.slice(0, 4));
  let mois = Number(du.slice(5, 7));
  const quantieme = Number(du.slice(8, 10));
  if (![annee, mois, quantieme].every(Number.isFinite)) return 0;
  // Un mois entamé après son premier jour n'est pas complet.
  if (quantieme > 1) {
    mois += 1;
    if (mois > 12) {
      mois = 1;
      annee += 1;
    }
  }
  let n = 0;
  for (let i = 0; i < 400; i += 1) {
    const dernier = `${String(annee).padStart(4, "0")}-${String(mois).padStart(2, "0")}-${String(joursDuMois(annee, mois)).padStart(2, "0")}`;
    if (dernier > au) break;
    n += 1;
    mois += 1;
    if (mois > 12) {
      mois = 1;
      annee += 1;
    }
  }
  return n;
}

/**
 * Premier jour de l'exercice de congés qui contient `jusquA`.
 *
 * `mmjj` est un « MM-JJ » paramétré ('01-01' par défaut). L'exercice est la
 * dernière occurrence de cette date à `jusquA` ou avant.
 */
export function debutExercice(jusquA: string, mmjj = "01-01"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jusquA)) return "";
  if (!/^\d{2}-\d{2}$/.test(mmjj)) mmjj = "01-01";
  const an = Number(jusquA.slice(0, 4));
  const candidat = `${an}-${mmjj}`;
  return candidat <= jusquA ? candidat : `${an - 1}-${mmjj}`;
}

export interface SoldeConges {
  /** Jours acquis depuis l'entrée, arrondis au demi-jour. */
  acquis: number;
  /** Jours déjà pris (absences acceptées de nature « congé »). */
  pris: number;
  /** Jours posés mais pas encore acceptés. */
  enAttente: number;
  /** Report de l'exercice précédent, saisi à la main. */
  reporte: number;
  /** Ce qui reste réellement disponible, report compris, attente déduite. */
  restant: number;
}

/**
 * Solde de congés d'un agent, POUR L'EXERCICE EN COURS.
 *
 * ── POURQUOI L'EXERCICE BORNE TOUT ───────────────────────────────────────
 * Le droit à congés se compte par exercice, et le reliquat d'un exercice
 * clos passe dans `reporte`. Cumuler l'ancienneté TOTALE reviendrait donc à
 * compter deux fois le même reliquat, et à ignorer tous les congés pris
 * avant la mise en service de l'application, qui ne sont dans aucune table.
 *
 * Une personne entrée en 2019 se serait vu créditer quatre-vingt-onze mois
 * de service, soit deux cent vingt-sept jours de congé, alors que son droit
 * réel est de l'ordre de la trentaine. Une direction qui accorde en
 * regardant ce chiffre n'a plus aucun garde-fou : c'est la faute la plus
 * grave que ce module pouvait porter.
 *
 * L'acquisition part donc du plus TARDIF entre la date d'entrée et le début
 * de l'exercice, et se plafonne à douze mois. Symétriquement, l'appelant ne
 * doit sommer dans `joursPris` que les absences du MÊME exercice.
 *
 * ── LES JOURS EN ATTENTE ─────────────────────────────────────────────────
 * Ils sont retranchés du restant sans être comptés comme pris : sinon la
 * même personne pourrait poser trois fois le solde qui lui reste avant que
 * quiconque ait validé quoi que ce soit. Ils réapparaissent si la demande
 * est refusée.
 */
export function calculerSolde(entrees: {
  dateEntree: string;
  jusquA: string;
  joursPris: number;
  joursEnAttente?: number;
  reporte?: number;
  acquisitionParMois?: number;
  /** Premier jour de l'exercice ; à défaut, l'année civile de `jusquA`. */
  debutExercice?: string;
}): SoldeConges {
  const taux = entrees.acquisitionParMois ?? ACQUISITION_PAR_MOIS;
  const debutEx = entrees.debutExercice || debutExercice(entrees.jusquA);
  const depart =
    entrees.dateEntree && entrees.dateEntree > debutEx ? entrees.dateEntree : debutEx;
  const mois = entrees.dateEntree
    ? Math.min(12, moisComplets(depart, entrees.jusquA))
    : 0;
  // Au demi-jour : le droit s'exprime en demi-journées, pas en fractions.
  const acquis = Math.round(mois * taux * 2) / 2;
  const pris = Math.max(0, entrees.joursPris);
  const enAttente = Math.max(0, entrees.joursEnAttente ?? 0);
  const reporte = entrees.reporte ?? 0;
  return {
    acquis,
    pris,
    enAttente,
    reporte,
    restant: Math.round((acquis + reporte - pris - enAttente) * 2) / 2,
  };
}
