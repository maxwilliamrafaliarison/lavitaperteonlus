/* ============================================================
   POINTAGE — moteur de calcul du temps de travail
   ============================================================

   Module PUR (aucune I/O) : il transforme une liste d'événements bruts de
   pointeuse en une journée de travail exploitable. Testable tel quel, et
   c'est indispensable — c'est lui qui décide des heures payées.

   ── CE QUE LES DONNÉES RÉELLES NOUS ONT APPRIS ────────────────────────────
   1. Le sens annoncé par la pointeuse (Check-In / Check-Out) est FAUX dans
      9 % (REX) à 36 % (MIARAKA) des cas sur le premier passage du jour : le
      terminal reste en mode « sortie » et l'agent badge dessus. On ignore
      donc ce champ et on déduit le sens de l'ORDRE CHRONOLOGIQUE.
   2. Un même passage physique produit souvent DEUX lignes (visage puis
      empreinte, à 1-3 secondes d'intervalle). Sans fusion, une entrée
      devient une entrée + une sortie et la journée s'effondre à 0 minute.
   3. Le nombre de pointages par jour varie : 4 (matin+après-midi), 2
      (journée continue ou demi-journée), 1 (oubli), 3, 5…
   ============================================================ */

/** Un pointage brut, déjà rattaché à un agent et à un jour. */
export interface EvenementPointage {
  horodatage: string; // "YYYY-MM-DD HH:MM:SS"
  jour: string; // "YYYY-MM-DD"
}

/** Horaire théorique applicable à l'agent ce jour-là. */
export interface HoraireTheorique {
  matinDebut: string; // "HH:MM" ("" = pas de service le matin)
  matinFin: string;
  apremDebut: string;
  apremFin: string;
  joursTravailles: number[]; // 1 = lundi … 7 = dimanche
  toleranceMinutes: number;
  minutesJour: number;
}

/** Correction saisie par le responsable (motif obligatoire côté base). */
export interface AjustementJour {
  matinDebut?: string;
  matinFin?: string;
  apremDebut?: string;
  apremFin?: string;
  typeAbsence?: string; // conge | maladie | mission | ferie | absence
}

export interface JourneeCalculee {
  jour: string;
  /** Paires entrée/sortie retenues, dans l'ordre. */
  plages: Array<{ debut: string; fin: string | null }>;
  /** Minutes de présence effectivement travaillées. */
  minutesTravaillees: number;
  minutesRetard: number;
  minutesDepartAnticipe: number;
  minutesPause: number;
  /** Minutes au-delà de la journée théorique — PROPOSÉES, à valider (choix 3a). */
  minutesSupProposees: number;
  /** Le jour est-il théoriquement travaillé (selon l'horaire) ? */
  jourOuvre: boolean;
  typeAbsence: string;
  /** Anomalies à signaler au responsable plutôt qu'à masquer. */
  anomalies: string[];
  /** Vrai si des heures viennent d'un ajustement manuel. */
  ajuste: boolean;
}

/* ── Utilitaires de temps ─────────────────────────────────────────────── */

/** "HH:MM" ou "HH:MM:SS" → minutes depuis minuit. "" → null. */
export function versMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm).trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** minutes → "H:MM" (format des feuilles Excel du centre). */
export function versHeures(minutes: number): string {
  const n = Math.max(0, Math.round(minutes));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

/** Extrait "HH:MM" d'un horodatage "YYYY-MM-DD HH:MM:SS". */
export function heureDe(horodatage: string): string {
  const m = /(\d{1,2}):(\d{2})/.exec(String(horodatage).slice(10));
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

/** Jour de la semaine ISO (1 = lundi … 7 = dimanche) d'un "YYYY-MM-DD". */
export function jourSemaine(jour: string): number {
  const d = new Date(`${jour}T12:00:00Z`);
  return d.getUTCDay() === 0 ? 7 : d.getUTCDay();
}

/**
 * Fusionne les pointages trop rapprochés : un même passage badgé au visage
 * PUIS à l'empreinte génère deux lignes à quelques secondes. Sans cette
 * fusion, l'entrée serait immédiatement suivie d'une « sortie ».
 */
export function fusionnerPassages(
  evenements: EvenementPointage[],
  seuilSecondes = 90,
): string[] {
  const tries = [...evenements]
    .map((e) => e.horodatage)
    .sort((a, b) => a.localeCompare(b));
  const out: string[] = [];
  for (const h of tries) {
    const dernier = out[out.length - 1];
    if (dernier && ecartSecondes(dernier, h) <= seuilSecondes) continue;
    out.push(h);
  }
  return out;
}

function ecartSecondes(a: string, b: string): number {
  const ta = Date.parse(a.replace(" ", "T") + "Z");
  const tb = Date.parse(b.replace(" ", "T") + "Z");
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(tb - ta) / 1000;
}

/* ── Moteur ───────────────────────────────────────────────────────────── */

/**
 * Calcule une journée de travail à partir des pointages bruts du jour.
 *
 * Le sens est déduit de l'ordre : 1er = entrée, 2e = sortie, 3e = entrée…
 * Un nombre IMPAIR de passages signifie une sortie non pointée : on ne
 * devine pas une heure de fin (ce serait inventer du temps payé), on
 * signale l'anomalie et on laisse le responsable trancher par ajustement.
 */
export function calculerJournee(
  jour: string,
  evenements: EvenementPointage[],
  horaire: HoraireTheorique,
  ajustement?: AjustementJour,
): JourneeCalculee {
  const anomalies: string[] = [];
  const jourOuvre = horaire.joursTravailles.includes(jourSemaine(jour));
  const typeAbsence = ajustement?.typeAbsence ?? "";

  // 1. Heures retenues : l'ajustement prime sur la machine (il est motivé
  //    et tracé), sinon on prend les passages fusionnés.
  const aj = ajustement ?? {};
  const ajusteMatin = Boolean(aj.matinDebut || aj.matinFin);
  const ajusteAprem = Boolean(aj.apremDebut || aj.apremFin);
  const passages = fusionnerPassages(evenements).map(heureDe).filter(Boolean);

  const plages: Array<{ debut: string; fin: string | null }> = [];
  if (ajusteMatin || ajusteAprem) {
    if (aj.matinDebut) plages.push({ debut: aj.matinDebut, fin: aj.matinFin || null });
    if (aj.apremDebut) plages.push({ debut: aj.apremDebut, fin: aj.apremFin || null });
    // Les passages machine non couverts par l'ajustement restent comptés.
    if (!ajusteMatin && passages.length >= 2) plages.unshift({ debut: passages[0], fin: passages[1] });
  } else {
    for (let i = 0; i < passages.length; i += 2) {
      plages.push({ debut: passages[i], fin: passages[i + 1] ?? null });
    }
  }

  // 2. Anomalies — signalées, jamais silencieusement « réparées ».
  if (passages.length === 1 && !ajusteMatin && !ajusteAprem) {
    anomalies.push("Un seul pointage : sortie non enregistrée");
  } else if (passages.length % 2 === 1 && !ajusteMatin && !ajusteAprem) {
    anomalies.push(`${passages.length} pointages (nombre impair) : un passage manque`);
  }
  if (!jourOuvre && plages.length > 0 && !typeAbsence) {
    anomalies.push("Présence un jour non ouvré");
  }

  // 3. Temps de présence : somme des plages COMPLÈTES uniquement.
  let minutesTravaillees = 0;
  for (const p of plages) {
    const d = versMinutes(p.debut);
    const f = p.fin ? versMinutes(p.fin) : null;
    if (d === null || f === null) continue;
    if (f > d) minutesTravaillees += f - d;
  }

  // 4. Pause méridienne : entre la fin de la 1re plage et le début de la 2e.
  let minutesPause = 0;
  if (plages.length >= 2 && plages[0].fin && plages[1].debut) {
    const f0 = versMinutes(plages[0].fin);
    const d1 = versMinutes(plages[1].debut);
    if (f0 !== null && d1 !== null && d1 > f0) minutesPause = d1 - f0;
  }

  // 5. Retard / départ anticipé, par rapport à l'horaire théorique. On ne
  //    les compte QUE les jours ouvrés et si la plage existe réellement.
  let minutesRetard = 0;
  let minutesDepartAnticipe = 0;
  if (jourOuvre && plages.length > 0 && !typeAbsence) {
    const theoDebut = versMinutes(horaire.matinDebut);
    const premier = versMinutes(plages[0].debut);
    if (theoDebut !== null && premier !== null) {
      const retard = premier - theoDebut - horaire.toleranceMinutes;
      if (retard > 0) minutesRetard = retard;
    }
    const theoFin = versMinutes(horaire.apremFin || horaire.matinFin);
    const derniere = plages[plages.length - 1];
    const dernier = derniere.fin ? versMinutes(derniere.fin) : null;
    if (theoFin !== null && dernier !== null) {
      const avance = theoFin - dernier - horaire.toleranceMinutes;
      if (avance > 0) minutesDepartAnticipe = avance;
    }
  }

  // 6. Heures supplémentaires PROPOSÉES (le responsable accorde ensuite).
  const minutesSupProposees =
    minutesTravaillees > horaire.minutesJour
      ? minutesTravaillees - horaire.minutesJour
      : 0;

  return {
    jour,
    plages,
    minutesTravaillees,
    minutesRetard,
    minutesDepartAnticipe,
    minutesPause,
    minutesSupProposees,
    jourOuvre,
    typeAbsence,
    anomalies,
    ajuste: ajusteMatin || ajusteAprem,
  };
}

/** Agrège un mois de journées pour l'état mensuel d'un agent. */
export function agregerMois(journees: JourneeCalculee[]) {
  const travaillees = journees.filter((j) => j.minutesTravaillees > 0);
  return {
    joursTravailles: travaillees.length,
    minutesTravaillees: journees.reduce((s, j) => s + j.minutesTravaillees, 0),
    minutesRetard: journees.reduce((s, j) => s + j.minutesRetard, 0),
    minutesDepartAnticipe: journees.reduce((s, j) => s + j.minutesDepartAnticipe, 0),
    minutesSupProposees: journees.reduce((s, j) => s + j.minutesSupProposees, 0),
    nbAnomalies: journees.reduce((s, j) => s + j.anomalies.length, 0),
    absences: journees.filter((j) => j.typeAbsence).length,
  };
}
