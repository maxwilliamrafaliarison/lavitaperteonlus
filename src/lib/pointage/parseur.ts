/* ============================================================
   POINTAGE — parseur des exports ZKAccess (pointeuses ZKTeco MB360)
   ============================================================

   Module PUR : reçoit les lignes déjà extraites du classeur (tableaux de
   cellules) et rend des pointages normalisés. L'ouverture du fichier reste
   à l'appelant (xlsx côté serveur), ce qui rend ce cœur testable sans I/O.

   ── PIÈGES RÉELS TRAITÉS ICI (constatés sur 5 608 lignes) ────────────────
   • ZKAccess PLAFONNE l'export à 500 lignes : l'opérateur exporte par
     tranches, une FEUILLE par tranche, avec des bornes qui SE CHEVAUCHENT.
     → lire toutes les feuilles + dédoublonner (95 doublons sur REX mai).
   • « Date And Time » est parfois un NOMBRE (serial Excel) au lieu d'une
     chaîne → sinon 4 lignes de REX mai sont perdues ou mal datées.
   • Lignes parasites « Disconnected » (perte de liaison du terminal), sans
     Personnel ID → à filtrer (Event Description ≠ « Normal Punch Open »).
   • « Device Name » est le lieu du BADGE, pas le site de rattachement.
   ============================================================ */

export interface PointageBrut {
  /** Identifiant dans l'installation ZKAccess (non stable → à résoudre). */
  idPointeuse: string;
  prenom: string;
  horodatage: string; // "YYYY-MM-DD HH:MM:SS"
  jour: string; // "YYYY-MM-DD"
  appareil: string; // Device Name : REX | MIARAKA
  sensBrut: string; // in | out | none (peu fiable, conservé pour audit)
  verif: string; // Only Fingerprint | Only Face | Only Card
}

export interface ResultatParse {
  pointages: PointageBrut[];
  lignesLues: number;
  ignoreesParasites: number;
  ignoreesDoublons: number;
  anomalies: string[];
}

/** Convertit un serial Excel (jours depuis 1899-12-30) en "YYYY-MM-DD HH:MM:SS". */
export function serialVersHorodatage(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/**
 * Normalise la cellule « Date And Time », qui arrive soit en texte
 * ("2026-06-30 20:35:22" ou "5/6/26 12:05"), soit en serial numérique.
 * Rend "" si la valeur est inexploitable — jamais une date inventée.
 */
export function normaliserHorodatage(valeur: unknown): string {
  if (valeur === null || valeur === undefined || valeur === "") return "";
  if (typeof valeur === "number" && Number.isFinite(valeur)) {
    return serialVersHorodatage(valeur);
  }
  const s = String(valeur).trim();
  // Format ISO natif de ZKAccess.
  const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (iso) {
    const [, a, mo, j, h, mi, se] = iso;
    return `${a}-${mo}-${j} ${h.padStart(2, "0")}:${mi}:${se ?? "00"}`;
  }
  // Format affiché par Excel : "5/6/26 12:05" (m/j/aa).
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ ](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (us) {
    const [, mo, j, aa, h, mi, se] = us;
    const an = aa.length === 2 ? `20${aa}` : aa;
    return `${an}-${mo.padStart(2, "0")}-${j.padStart(2, "0")} ${h.padStart(2, "0")}:${mi}:${se ?? "00"}`;
  }
  // Serial passé en texte.
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) return serialVersHorodatage(n);
  return "";
}

const norm = (v: unknown) => String(v ?? "").trim();

/** Traduit le In/Out Status ZKAccess (conservé pour audit, pas pour le calcul). */
function sensDe(v: string): string {
  const s = v.toLowerCase();
  if (s.includes("check-in") || s === "in") return "in";
  if (s.includes("check-out") || s === "out") return "out";
  return "none";
}

/**
 * Analyse les lignes d'UNE feuille (première ligne = en-têtes).
 * Les colonnes sont repérées PAR LIBELLÉ : leur ordre est stable aujourd'hui
 * mais rien ne le garantit, et coder des index en dur casserait au premier
 * export d'une version différente de ZKAccess.
 */
export function parserFeuille(lignes: unknown[][]): PointageBrut[] {
  if (!lignes.length) return [];
  const entetes = lignes[0].map((c) => norm(c).toLowerCase());
  const idx = (libelle: string) => entetes.findIndex((e) => e === libelle.toLowerCase());
  const cDate = idx("date and time");
  const cId = idx("personnel id");
  const cPrenom = idx("first name");
  const cDevice = idx("device name");
  const cSens = idx("in/out status");
  const cVerif = idx("verify type");
  const cDesc = idx("event description");
  if (cDate < 0 || cId < 0) return []; // feuille qui n'est pas un export de pointages

  const out: PointageBrut[] = [];
  for (let i = 1; i < lignes.length; i++) {
    const r = lignes[i];
    if (!r) continue;
    // Filtre des lignes parasites : perte de liaison du terminal.
    const desc = cDesc >= 0 ? norm(r[cDesc]) : "";
    if (desc && desc.toLowerCase() !== "normal punch open") continue;
    const idPointeuse = norm(r[cId]);
    if (!idPointeuse) continue; // pas d'agent → ligne technique
    const horodatage = normaliserHorodatage(r[cDate]);
    if (!horodatage) continue;
    out.push({
      idPointeuse,
      prenom: cPrenom >= 0 ? norm(r[cPrenom]) : "",
      horodatage,
      jour: horodatage.slice(0, 10),
      appareil: cDevice >= 0 ? norm(r[cDevice]) : "",
      sensBrut: cSens >= 0 ? sensDe(norm(r[cSens])) : "none",
      verif: cVerif >= 0 ? norm(r[cVerif]) : "",
    });
  }
  return out;
}

/**
 * Analyse un classeur ENTIER : toutes les feuilles, puis dédoublonnage.
 * `feuilles` = tableau de [nom, lignes] tel que fourni par l'appelant.
 *
 * Le dédoublonnage porte sur (horodatage + id + appareil) : c'est exactement
 * la signature d'un même passage réexporté dans deux tranches qui se
 * chevauchent. On ne fusionne pas ici les doublons visage/empreinte : ils
 * sont de VRAIS événements distincts, dont le regroupement relève du calcul
 * (fusionnerPassages), pas de l'import — l'import garde la trace complète.
 */
export function parserClasseur(feuilles: Array<[string, unknown[][]]>): ResultatParse {
  const anomalies: string[] = [];
  let lignesLues = 0;
  let ignoreesParasites = 0;
  const tous: PointageBrut[] = [];

  for (const [nom, lignes] of feuilles) {
    const brut = Math.max(0, lignes.length - 1);
    lignesLues += brut;
    const p = parserFeuille(lignes);
    if (brut > 0 && p.length === 0) {
      anomalies.push(`Feuille « ${nom} » : aucun pointage exploitable`);
    }
    ignoreesParasites += brut - p.length;
    tous.push(...p);
  }

  const vus = new Set<string>();
  const pointages: PointageBrut[] = [];
  for (const p of tous) {
    const cle = `${p.horodatage}|${p.idPointeuse}|${p.appareil}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    pointages.push(p);
  }
  pointages.sort((a, b) => a.horodatage.localeCompare(b.horodatage));

  return {
    pointages,
    lignesLues,
    ignoreesParasites,
    ignoreesDoublons: tous.length - pointages.length,
    anomalies,
  };
}

/**
 * Identifiant déterministe d'un pointage : réimporter le même fichier ne
 * peut pas créer de doublon en base (idempotence exigée par un import
 * mensuel répété, et par les tranches qui se chevauchent).
 */
export function idPointage(p: PointageBrut, installation: string): string {
  const compact = p.horodatage.replace(/[^0-9]/g, "");
  return `PTG-${installation}-${p.idPointeuse}-${compact}`;
}
