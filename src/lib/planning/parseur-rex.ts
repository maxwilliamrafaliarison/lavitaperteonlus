/* ============================================================
   PLANNING REX — lecture des feuilles hebdomadaires
   ============================================================

   Module PUR. Une feuille = une semaine ; chaque bloc-jour liste les
   services, avec les agents du matin et de l'après-midi.

   ── TROIS PIÈGES VÉRIFIÉS SUR LES 190 FEUILLES ───────────────────────────
   1. Le titre et le nom d'onglet MENTENT. Le planning se fabrique en
      dupliquant la semaine précédente, et les dates ne sont pas toujours
      corrigées : la feuille « 0308-0908 » porte encore « du 27 JUILLET AU
      02 AOUT ». Seules les dates des blocs-jours font foi, et on les
      contrôle contre le jour de semaine annoncé.
   2. La colonne E a DEUX sens selon sa position dans le bloc : les quatre
      premières lignes portent Ouverture / Clôture / Absente / Congé du
      JOUR, les suivantes la SALLE du service en regard.
   3. Les lignes de note en bas de feuille (« NB: Le Centre Rex ouvre à
      8h… ») occupent la colonne A comme un jour. Les prendre pour des
      journées ajoute 90 fausses dates.
   ============================================================ */

export interface AffectationRex {
  jour: string; // "YYYY-MM-DD"
  service: string;
  /** Agents cités, tels qu'écrits (résolution d'identité faite plus tard). */
  matin: string[];
  apresMidi: string[];
  salle: string;
  /** Vrai si Matin et Après-midi étaient fusionnés : mission d'une journée. */
  journeeEntiere: boolean;
}

export interface SemaineRex {
  feuille: string;
  /** Dates réellement lues dans les blocs-jours. */
  jours: string[];
  affectations: AffectationRex[];
  /** Métadonnées du jour, issues des 4 premières lignes de la colonne E. */
  meta: Array<{ jour: string; ouverture: string; cloture: string; absents: string[]; conges: string[] }>;
  anomalies: string[];
}

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** Extrait une date « Lundi 27/07/2026 » → "2026-07-27", avec son libellé. */
export function lireDateJour(cellule: string): { jour: string; libelleJour: string } | null {
  const s = String(cellule ?? "").replace(/[\r\n]+/g, " ").trim();
  const m = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/.exec(s);
  if (!m) return null;
  const [, j, mo, a] = m;
  const libelle = (/^\s*(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i.exec(s)?.[1] ?? "").toLowerCase();
  return { jour: `${a}-${mo.padStart(2, "0")}-${j.padStart(2, "0")}`, libelleJour: libelle };
}

/** Le jour de semaine annoncé correspond-il à la date ? (détecte les copies) */
export function dateCoherente(jour: string, libelleJour: string): boolean {
  if (!libelleJour) return true;
  const d = new Date(`${jour}T12:00:00Z`);
  return JOURS[d.getUTCDay()] === libelleJour;
}

/**
 * Découpe une cellule d'agents. Les quatre séparateurs coexistent dans les
 * fichiers (« + », « / », « , », retour ligne) — et « / » est ambigu : dans
 * « Naina/Diricks » il joint deux agents, dans « Salle 8/Box » un lieu
 * composé. Ici on est en colonne d'agents, la lecture « et » s'applique.
 */
export function lireAgents(cellule: string): string[] {
  const s = String(cellule ?? "").trim();
  if (!s) return [];
  return s
    .split(/[\r\n]+|\s*\+\s*|\s*\/\s*|\s*,\s*|\s+et\s+/i)
    .map((x) => x.trim())
    .filter((x) => x.length > 1);
}

const norm = (v: unknown) => String(v ?? "").replace(/[\r\n]+/g, " ").trim();

/**
 * Analyse une feuille-semaine.
 * `lignes` = tableau de tableaux de cellules (colonnes A..E au minimum).
 */
export function parserFeuilleRex(feuille: string, lignes: unknown[][]): SemaineRex {
  const anomalies: string[] = [];
  const affectations: AffectationRex[] = [];
  const meta: SemaineRex["meta"] = [];
  const jours: string[] = [];

  let jourCourant = "";
  let posDansBloc = 0;
  let metaCourante: SemaineRex["meta"][number] | null = null;

  for (let i = 0; i < lignes.length; i++) {
    const r = lignes[i];
    if (!r) continue;
    const colA = norm(r[0]);
    const service = norm(r[1]);

    // Nouvelle journée ? Uniquement si la colonne A porte une VRAIE date :
    // les notes de bas de feuille occupent aussi cette colonne.
    if (colA) {
      const d = lireDateJour(colA);
      if (d) {
        if (!dateCoherente(d.jour, d.libelleJour)) {
          anomalies.push(
            `Feuille « ${feuille} » : « ${colA} » — le ${d.jour} n'est pas un ${d.libelleJour}. Date probablement non corrigée après duplication.`,
          );
        }
        jourCourant = d.jour;
        posDansBloc = 0;
        if (!jours.includes(d.jour)) jours.push(d.jour);
        metaCourante = { jour: d.jour, ouverture: "", cloture: "", absents: [], conges: [] };
        meta.push(metaCourante);
      } else if (!service) {
        // Ligne de note (« NB: Le Centre Rex ouvre à 8h… ») : on la saute.
        continue;
      }
    }
    if (!jourCourant || !service) continue;

    // Colonne E : métadonnée du jour sur les 4 premières lignes, salle ensuite.
    const colE = norm(r[4]);
    if (posDansBloc < 4 && metaCourante) {
      const valeur = colE.replace(/^[^-]*-\s*/, "").trim();
      if (posDansBloc === 0 && /ouverture/i.test(colE)) metaCourante.ouverture = valeur;
      else if (posDansBloc === 1 && /cl[oô]ture/i.test(colE)) metaCourante.cloture = valeur;
      else if (posDansBloc === 2 && /absente?/i.test(colE)) metaCourante.absents = lireAgents(valeur);
      else if (posDansBloc === 3 && /cong[ée]/i.test(colE)) metaCourante.conges = lireAgents(valeur);
    }

    const matin = lireAgents(norm(r[2]));
    const apresMidi = lireAgents(norm(r[3]));
    // Matin et après-midi fusionnés : la cellule D est vide alors que C est
    // remplie sur une ligne de mission — marqueur d'une journée entière.
    const journeeEntiere = matin.length > 0 && apresMidi.length === 0 && /mission|formation|visite/i.test(service);

    if (matin.length || apresMidi.length) {
      affectations.push({
        jour: jourCourant,
        service,
        matin,
        apresMidi,
        salle: posDansBloc >= 4 ? colE : "",
        journeeEntiere,
      });
    }
    posDansBloc++;
  }

  if (jours.length === 0) anomalies.push(`Feuille « ${feuille} » : aucune date exploitable.`);
  return { feuille, jours, affectations, meta, anomalies };
}

/**
 * Rapproche un nom écrit dans le planning d'un agent du référentiel.
 * Les titres (Dr, Dc, Pr) et qualificatifs (stagiaire, siège) sont retirés ;
 * la comparaison porte sur le prénom usuel, sans accents.
 */
export function normaliserNom(nom: string): string {
  return String(nom)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(dr|dc|pr|mme|madame|mr)\b\.?/g, "")
    .replace(/\b(stagiaire|stagaire|volontaires?|siege)\b/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
