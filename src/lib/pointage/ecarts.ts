/* ============================================================
   POINTAGE — écarts entre le PLANNING et les passages réels
   ============================================================

   Module PUR (aucune I/O). Il répond à la question que la RH se pose
   chaque matin : cette personne était-elle là quand le planning le
   prévoyait, et sinon, de combien s'en écarte-t-elle ?

   ── LA RÉFÉRENCE EST LE CRÉNEAU DU JOUR, PAS UN HORAIRE FIXE ─────────────
   `calcul.ts` compare les passages à l'horaire théorique attaché à l'agent.
   C'est juste pour un poste régulier, faux pour le centre : les classeurs
   de la RH portent une colonne PLANNING remplie JOUR PAR JOUR — « 7H-12H »
   lundi, « 7H-11H REX 14 » mardi, « REPOS » samedi. Le même agent n'a pas
   le même horaire deux jours de suite, et c'est le créneau du jour qui dit
   s'il est en retard.

   ── LES RÈGLES, RELEVÉES SUR LES CLASSEURS RÉELS ─────────────────────────
   Tout ce qui suit a été vérifié cellule par cellule sur juin et juillet
   2026, puis confirmé par la DRH.

   RETARD — aucune tolérance. Cynthia, créneau 7H-12H : arrivée 07:03 →
   3 minutes de retard ; 07:09 → 9 ; 07:25 → 25. La minute compte.

   SORTIE ANTICIPÉE — aucune tolérance non plus. Naina, créneau 06H-18H :
   sortie 17:59 → 1 minute ; 17:54 → 6 minutes.

   AVANCE PLAFONNÉE — arriver en avance ne se paie que jusqu'à une limite,
   propre au POSTE (15 minutes pour les agents de sécurité, 30 relevées
   chez Maurice à MIARAKA). L'heure de début retenue est donc
   `max(badge, début planifié − plafond)`. Vérifié au chiffre près :
   Maurice, créneau 17H-6H, badge 16:23 → retenu 16:30, et son total du
   jour (13:29) se recalcule exactement depuis 16:30 ; badge à 16:32, après
   le plafond, il est retenu tel quel et le total tombe à 13:27.

   ⚠️ Dans les classeurs, ce plafond n'est appliqué QUE là où quelqu'un a
   pensé à ajouter une colonne « LIM ». Naina, arrivée à 05:36 pour un
   créneau à 06H, s'est vu créditer ses 24 minutes d'avance. Appliquer la
   règle uniformément fera donc BAISSER certains totaux : c'est voulu, mais
   ce n'est pas indolore, et la RH doit le savoir avant la première paie.

   HEURES DE NUIT — la plage court de 22:00 à 05:00. Elle se déduit des
   valeurs saisies : un poste du soir (…→23:59) porte toujours 2 h de nuit,
   un poste du matin (00:00→…) toujours 5 h, une garde complète 7 h. Les
   classeurs arrondissent à l'heure ; on compte ici à la minute.

   SANS BADGE ≠ EN RETARD — à MIARAKA, la pointeuse ne voit qu'une fraction
   du travail : sur juillet, Hervé n'a que 3 passages, Fanja 5. Confondre
   « n'a pas badgé » et « est arrivé en retard » accuserait des gens
   présents. Les deux états sont distincts et le resteront.
   ============================================================ */

import { heureDe, versMinutes } from "./calcul";

/** Plage de nuit du centre : 22:00 → 05:00, à cheval sur minuit. */
export const NUIT_DEBUT = "22:00";
export const NUIT_FIN = "05:00";

/** Réglages propres au poste occupé. */
export interface ReglageEcarts {
  /**
   * Minutes d'avance créditées au maximum avant le début planifié.
   * 15 pour les agents de sécurité (règle donnée par la DRH), 30 relevées
   * à MIARAKA. 0 = l'avance n'est jamais créditée.
   */
  avanceMaxMinutes: number;
  /** Minutes de battement avant qu'un retard soit compté. 0 au centre. */
  toleranceRetardMinutes: number;
}

export const REGLAGE_DEFAUT: ReglageEcarts = {
  avanceMaxMinutes: 15,
  toleranceRetardMinutes: 0,
};

/** Le créneau planifié pour ce jour-là, tel que le planning le porte. */
export interface CreneauDuJour {
  /** "HH:MM" — vide si aucun créneau n'est planifié. */
  debut: string;
  fin: string;
  /** Seconde plage d'une journée coupée (« 7H-12H / 14H-17H »). */
  debut2?: string;
  fin2?: string;
  /** REPOS, CONGE, FERIE… : le jour n'est pas travaillé. */
  repos?: boolean;
  /** Site où le travail est attendu (REX, MIARAKA, MAHASOA…). */
  site?: string;
  /** Libellé d'origine, conservé pour l'affichage et l'audit. */
  libelle?: string;
}

/** Un passage retenu, avec le terminal qui l'a lu. */
export interface PassageSite {
  horodatage: string; // "YYYY-MM-DD HH:MM:SS"
  site: string; // Device Name : le lieu du BADGE
}

export type EtatJour =
  | "repos" // rien n'était attendu
  | "conforme" // présent dans les clous
  | "retard"
  | "sortie_anticipee"
  | "retard_et_sortie" // les deux le même jour
  | "sans_badge" // planifié, mais aucun passage : à vérifier, pas à sanctionner
  | "hors_planning"; // a badgé alors que rien n'était prévu

export interface EcartsJour {
  jour: string;
  etat: EtatJour;
  retardMinutes: number;
  departAnticipeMinutes: number;
  /** Minutes d'avance NON créditées, retranchées par le plafond du poste. */
  avanceIgnoreeMinutes: number;
  /** Heure de début effectivement retenue après plafond ("" si sans badge). */
  debutRetenu: string;
  finRetenue: string;
  minutesNuit: number;
  /** Sites où la personne a réellement badgé, dans l'ordre de passage. */
  sitesBadges: string[];
  /**
   * null quand aucun site n'est planifié — on ne reproche pas un écart à
   * une consigne qui n'a pas été donnée.
   */
  siteConforme: boolean | null;
  /** Phrases prêtes à afficher, dans la langue du terrain. */
  motifs: string[];
}

/* ── Utilitaires ──────────────────────────────────────────────────────── */

/**
 * Minutes d'une plage [debut, fin] qui tombent dans la nuit (22:00 → 05:00).
 * Les deux bornes sont des "HH:MM" du MÊME jour civil : les classeurs
 * coupent les gardes à minuit (00:00 et 23:59), et le calcul suit cette
 * convention plutôt que d'inventer une continuité que les données n'ont pas.
 */
export function minutesDeNuit(debut: string, fin: string): number {
  const d = versMinutes(debut);
  const f = versMinutes(fin);
  if (d === null || f === null || f <= d) return 0;
  const nuitDebut = versMinutes(NUIT_DEBUT)!; // 1320
  const nuitFin = versMinutes(NUIT_FIN)!; // 300
  const chevauchement = (a: number, b: number) => Math.max(0, Math.min(f, b) - Math.max(d, a));
  // Deux fenêtres sur la journée civile : le petit matin, puis le soir.
  return chevauchement(0, nuitFin) + chevauchement(nuitDebut, 1440);
}

/** Le site badgé correspond-il au site attendu ? Comparaison tolérante. */
function memeSite(a: string, b: string): boolean {
  const n = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  return n(a) === n(b) && n(a) !== "";
}

/* ── Moteur ───────────────────────────────────────────────────────────── */

/**
 * Compare les passages d'une journée au créneau planifié.
 *
 * Ne « répare » rien : un jour sans badge reste un jour sans badge, un
 * badge hors planning reste signalé. Le rôle de cette fonction est de
 * DIRE l'écart, celui de la RH de le trancher.
 */
export function ecartsDuJour(
  jour: string,
  passages: PassageSite[],
  creneau: CreneauDuJour | null,
  reglage: ReglageEcarts = REGLAGE_DEFAUT,
): EcartsJour {
  const motifs: string[] = [];
  const tries = [...passages].sort((a, b) => a.horodatage.localeCompare(b.horodatage));
  const heures = tries.map((p) => heureDe(p.horodatage)).filter(Boolean);
  const sitesBadges = [...new Set(tries.map((p) => p.site).filter(Boolean))];

  const vide: EcartsJour = {
    jour,
    etat: "repos",
    retardMinutes: 0,
    departAnticipeMinutes: 0,
    avanceIgnoreeMinutes: 0,
    debutRetenu: "",
    finRetenue: "",
    minutesNuit: 0,
    sitesBadges,
    siteConforme: null,
    motifs,
  };

  // 1. Rien n'était prévu.
  if (!creneau || creneau.repos || !creneau.debut) {
    if (heures.length === 0) return vide;
    motifs.push("A badgé alors qu'aucun créneau n'était prévu");
    return { ...vide, etat: "hors_planning", debutRetenu: heures[0], finRetenue: heures.at(-1) ?? "" };
  }

  const debutPrevu = versMinutes(creneau.debut);
  const finPrevue = versMinutes(creneau.fin2 || creneau.fin);

  // 2. Prévu, mais aucun passage. On ne conclut RIEN d'autre que le fait.
  if (heures.length === 0) {
    motifs.push(
      `Aucun passage enregistré pour le créneau ${creneau.libelle || `${creneau.debut}–${creneau.fin}`}`,
    );
    return { ...vide, etat: "sans_badge", siteConforme: creneau.site ? false : null, motifs };
  }

  // 3. Début retenu : l'avance n'est créditée que jusqu'au plafond du poste.
  const premier = versMinutes(heures[0])!;
  let debutRetenuMin = premier;
  let avanceIgnoreeMinutes = 0;
  if (debutPrevu !== null && premier < debutPrevu) {
    const plancher = debutPrevu - reglage.avanceMaxMinutes;
    if (premier < plancher) {
      debutRetenuMin = plancher;
      avanceIgnoreeMinutes = plancher - premier;
      motifs.push(
        `Arrivée ${avanceIgnoreeMinutes + reglage.avanceMaxMinutes} min en avance : comptée à partir de ${fmt(plancher)}`,
      );
    }
  }

  // 4. Retard et sortie anticipée, sans tolérance sauf réglage explicite.
  let retardMinutes = 0;
  if (debutPrevu !== null) {
    const r = premier - debutPrevu - reglage.toleranceRetardMinutes;
    if (r > 0) {
      retardMinutes = r;
      motifs.push(`Retard de ${r} min sur un début prévu à ${creneau.debut}`);
    }
  }

  const dernier = versMinutes(heures.at(-1)!)!;
  let departAnticipeMinutes = 0;
  /* Un seul passage ne dit pas une sortie anticipée : il dit une sortie non
     badgée. Confondre les deux ferait payer à la personne l'oubli de la
     machine. */
  if (finPrevue !== null && heures.length >= 2) {
    const a = finPrevue - dernier - reglage.toleranceRetardMinutes;
    if (a > 0) {
      departAnticipeMinutes = a;
      motifs.push(`Sortie ${a} min avant la fin prévue à ${creneau.fin2 || creneau.fin}`);
    }
  }
  if (heures.length === 1) motifs.push("Un seul passage : la sortie n'a pas été badgée");

  // 5. Heures de nuit sur les plages réellement travaillées.
  let minutesNuit = 0;
  for (let i = 0; i + 1 < heures.length; i += 2) {
    const d = i === 0 ? fmt(debutRetenuMin) : heures[i];
    minutesNuit += minutesDeNuit(d, heures[i + 1]);
  }

  // 6. Le site : personne ne peut être à deux endroits à la fois.
  let siteConforme: boolean | null = null;
  if (creneau.site) {
    siteConforme = sitesBadges.length > 0 && sitesBadges.every((s) => memeSite(s, creneau.site!));
    if (!siteConforme) {
      motifs.push(
        `Badgé à ${sitesBadges.join(" puis ") || "nulle part"} alors que le planning prévoit ${creneau.site}`,
      );
    }
  }
  if (sitesBadges.length > 1) {
    motifs.push(`Passages sur deux sites le même jour : ${sitesBadges.join(" et ")}`);
  }

  const etat: EtatJour =
    retardMinutes > 0 && departAnticipeMinutes > 0
      ? "retard_et_sortie"
      : retardMinutes > 0
        ? "retard"
        : departAnticipeMinutes > 0
          ? "sortie_anticipee"
          : "conforme";

  return {
    jour,
    etat,
    retardMinutes,
    departAnticipeMinutes,
    avanceIgnoreeMinutes,
    debutRetenu: fmt(debutRetenuMin),
    finRetenue: heures.at(-1) ?? "",
    minutesNuit,
    sitesBadges,
    siteConforme,
    motifs,
  };
}

function fmt(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/* ── Présentation ─────────────────────────────────────────────────────── */

/**
 * Habillage d'un état, pensé pour rester lisible SANS la couleur.
 *
 * Le responsable imprime les états en noir et blanc et les affiche ; une
 * personne sur douze parmi les hommes distingue mal le rouge du vert. Le
 * rouge ne porte donc jamais l'information seul : un signe et un mot le
 * doublent toujours.
 */
export const HABILLAGE: Record<EtatJour, { signe: string; mot: string; ton: string }> = {
  conforme: { signe: "·", mot: "Conforme", ton: "neutre" },
  retard: { signe: "▲", mot: "Retard", ton: "alerte" },
  sortie_anticipee: { signe: "▼", mot: "Sortie anticipée", ton: "alerte" },
  retard_et_sortie: { signe: "◆", mot: "Retard et sortie anticipée", ton: "alerte" },
  sans_badge: { signe: "?", mot: "Sans badge", ton: "attention" },
  hors_planning: { signe: "+", mot: "Hors planning", ton: "attention" },
  repos: { signe: "—", mot: "Repos", ton: "neutre" },
};

/** Agrège les écarts d'un mois pour l'état d'un agent. */
export function agregerEcarts(jours: EcartsJour[]) {
  return {
    joursEnRetard: jours.filter((j) => j.retardMinutes > 0).length,
    minutesRetard: jours.reduce((s, j) => s + j.retardMinutes, 0),
    joursSortieAnticipee: jours.filter((j) => j.departAnticipeMinutes > 0).length,
    minutesDepartAnticipe: jours.reduce((s, j) => s + j.departAnticipeMinutes, 0),
    minutesNuit: jours.reduce((s, j) => s + j.minutesNuit, 0),
    joursSansBadge: jours.filter((j) => j.etat === "sans_badge").length,
    joursHorsPlanning: jours.filter((j) => j.etat === "hors_planning").length,
    minutesAvanceIgnoree: jours.reduce((s, j) => s + j.avanceIgnoreeMinutes, 0),
    /** Sites fréquentés dans le mois, pour la ligne « où a-t-il travaillé ? ». */
    sites: [...new Set(jours.flatMap((j) => j.sitesBadges))].sort(),
    joursHorsSite: jours.filter((j) => j.siteConforme === false && j.etat !== "sans_badge").length,
  };
}
