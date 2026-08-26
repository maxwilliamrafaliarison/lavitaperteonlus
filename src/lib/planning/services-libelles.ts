/* ============================================================
   RATTACHEMENT D'UN LIBELLÉ DE PLANNING À UN SERVICE
   ============================================================

   Module PUR. Les feuilles REX écrivent le service en toutes lettres, à la
   main, et le corpus en compte 238 orthographes pour 21 services. Un
   appariement littéral n'en reconnaissait que 14 : « Admin », « Labo
   Galenique », « Mission + Logistique » ou « Accueil-Caisse-RR-Fiches »
   ressortaient sans service, donc sans couleur dans la grille.

   ── POURQUOI CE N'EST PAS QU'UNE QUESTION D'AFFICHAGE ────────────────────
   L'accueil est un poste critique à REX. Le samedi 29 août, il est tenu par
   Sylvie, mais sous le libellé « Accueil-Caisse-RR-Fiches ». Faute de le
   reconnaître, l'application signalait un trou sur un poste critique là où
   quelqu'un était bel et bien planifié. Une alerte fausse coûte plus cher
   qu'une alerte absente : elle apprend à ne plus les lire.

   ── LA RÈGLE : LE PREMIER MOT-CLÉ GAGNE ──────────────────────────────────
   Elle n'est pas arbitraire, c'est celle qu'emploie le fichier : l'activité
   principale est écrite d'abord, les compléments suivent. « Mammographie +
   Echo mammaire » est une matinée de mammographie ; « Laboratoire Analyses
   + Cyto » est une matinée de laboratoire ; « Admin + Logistique + RH +
   Missions » est de l'administration, quand « Mission + Logistique + RH »
   est une mission. Classer par ORDRE D'APPARITION rend ces quatre cas justes
   d'un seul coup, là où une liste de priorités fixes en tranche un et se
   trompe sur l'autre.

   Ce qui ne correspond à aucun service ressort vide plutôt que rattaché de
   force : une formation, un carnaval ou une consultation d'ostéopathie ne
   sont pas des services du centre, et leur en inventer un salirait les
   statistiques par service.
   ============================================================ */

const sansAccents = (s: string) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Mots-clés par service, du catalogue `planning.services`.
 *
 * Chaque motif est cherché dans le libellé ; le service dont le motif
 * apparaît LE PLUS TÔT l'emporte. Les motifs sont donc écrits pour être
 * reconnaissables, pas pour être exclusifs.
 */
const MOTIFS: Array<{ service: string; motif: RegExp }> = [
  { service: "securite", motif: /securite/ },
  { service: "nettoyage", motif: /nettoyage/ },
  { service: "caisse", motif: /accueil|caisse/ },
  { service: "reception", motif: /reception/ },
  { service: "labo_gal", motif: /labo\s*galenique|galenique/ },
  /* Les deux laboratoires sont le seul cas que l'ordre d'apparition ne
     tranche pas : dans « Labo Galenique », le mot « Labo » précède
     « Galenique », si bien que le laboratoire d'analyses gagnait 831 lignes
     qui appartiennent au galénique. On refuse donc explicitement à
     « labo » d'être suivi de « galenique ». */
  { service: "labo_analyse", motif: /laboratoire|labo\b(?!\s*galenique)|anapath/ },
  { service: "cpn", motif: /\bcpn\b/ },
  { service: "mammo", motif: /mammo/ },
  { service: "echo", motif: /echographi/ },
  { service: "paptest", motif: /pap.?test|senologie|\bpap\b/ },
  { service: "cytologie", motif: /cytologi|\bcyto\b/ },
  { service: "coloration", motif: /coloration/ },
  { service: "gyneco", motif: /gyneco|colposcopi|\bcolpo\b/ },
  { service: "pediatrie", motif: /pediatri/ },
  { service: "nutrition", motif: /nutrition/ },
  { service: "vaccins", motif: /vaccin/ },
  { service: "pharmacie", motif: /pharmacie/ },
  { service: "consult", motif: /consultation/ },
  { service: "chauffeur", motif: /chauffeur/ },
  { service: "admin", motif: /\badmin/ },
  /* Le travail hors les murs, sous toutes ses écritures : missions,
     visites de courtoisie, tsena (le marché du mardi), et « RR » pour les
     remises de résultats en brousse. */
  { service: "mission", motif: /mission|visite de courtoisie|tsena|remise de resultat|\brr\b/ },
];

/**
 * Libellés qui ne DOIVENT être rattachés à aucun service.
 *
 * Ce ne sont pas des oublis : formations, événements et disciplines que le
 * centre n'a pas érigées en service. Les nommer ici les distingue d'un
 * libellé qu'on aurait manqué.
 */
const HORS_SERVICE = /^(formation|semaine de la|carnaval|canrnaval|osthe|osteo|kinesi|detartrage)/;

/**
 * Rattache un libellé de planning à un identifiant de service.
 *
 * @param libelle  le texte de la colonne « Service » de la feuille
 * @param connus   les identifiants du catalogue, pour ne jamais rendre un
 *                 service que la base ignore
 * @returns l'identifiant, ou "" si rien ne correspond avec certitude
 */
export function serviceDuLibelle(libelle: string, connus: ReadonlySet<string>): string {
  const s = sansAccents(libelle).trim();
  if (!s || HORS_SERVICE.test(s)) return "";

  let meilleur = "";
  let position = Number.POSITIVE_INFINITY;
  for (const { service, motif } of MOTIFS) {
    if (!connus.has(service)) continue;
    const m = motif.exec(s);
    if (m && m.index < position) {
      position = m.index;
      meilleur = service;
    }
  }
  return meilleur;
}
