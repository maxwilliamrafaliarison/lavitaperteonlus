/* ============================================================
   POINTAGE — résolution des noms usuels vers les fiches agent
   ============================================================

   Les plannings et les cahiers de la RH désignent les gens par leur nom
   usuel — « Naina », « Voahangy », « Fanja » — quand le référentiel porte
   l'état civil complet : « ZAFINIAINA ROGER FANOMEZANTSOA ». Entre les
   deux, aucune règle mécanique ne suffit :

     Voahangy  →  VOLOLOMBOAHANGY NIVONTSOA TIANA RAZAFIMALALA
                  (le nom usuel n'est même pas un morceau du nom d'état civil)
     Naina     →  ZAFINIAINA ROGER FANOMEZANTSOA
                  (mais « naina » figure aussi dans Faniloniaina, Aliniaina,
                   Harinirina — trois personnes que rien ne distingue)

   D'où ce module. Trois degrés, du plus sûr au plus faible, et JAMAIS de
   quatrième : ce qui ne se résout pas est signalé, pas deviné. Rattacher
   un planning à la mauvaise personne lui invente des retards.

   Ce fichier est la MÉMOIRE des arbitrages. Chaque ligne a été vérifiée
   sur les données — poste, site, horaires du classeur — et non supposée
   d'après une ressemblance de syllabes.
   ============================================================ */

export const normaliserUsuel = (s: string): string =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^(dr|dc|sf|mme|mr|pr)[\s.]+/i, "")
    .replace(/[^a-z0-9]/g, "");

/**
 * Noms usuels arbitrés à la main, valables partout dans le centre.
 *
 * `naina` : agent de sécurité, seul à tenir le service 06h-18h que porte
 * son onglet de pointage. `voahangy` : femme de ménage, dont le nom usuel
 * est tiré du milieu de « VOLOLOMBOAHANGY ». `aly` : le classeur écrit
 * « Dr Aly », le référentiel « Alimamonjisoa RAHAROSON ».
 */
export const ALIAS_CENTRE: Record<string, string> = {
  naina: "AG-REX-18",
  voahangy: "AG-REX-20",
  emily: "AG-REX-41",
  emilly: "AG-REX-41",
  mirana: "AG-REX-3",
  vololona: "AG-REX-19",
  aly: "AG-REX-43",
  dalianne: "AG-REX-24",
  jeannine: "AG-REX-23", // orthographié « Jeanine » au référentiel
  jeanine: "AG-REX-23",
  /* « Aina » : le planning la place sur la ligne « Admin » avec Lauria et
     Annitha — c'est la Responsable Administration, ALINIAINA RAJOELISON. */
  aina: "AG-REX-15",
  /* « Manitra » répond aussi bien pour FELANA MANITRA RABOTOMANASA que pour
     MANITRARIVO HARINIAINA. Le planning tranche seul : le 10 août, « Manitra »
     tient « Chauffeur + Logistique » pendant que « Felana » tient « Mission +
     Logistique » — deux lignes du même jour, donc deux personnes. Manitra est
     le manutentionnaire. */
  manitra: "AG-REX-21",
  felana: "AG-REX-17",
  /* « Jim » est Onésime, prestataire des deux centres, déjà au référentiel
     avec 266 passages. Un même homme, deux noms au planning. */
  jim: "AG-REX-16",
  /* « Herve (UM) » est le chauffeur des deux centres, le même que « Herve ».
     Le planning le prouve : le nom long n'apparaît que le 14 août, seul jour
     de la quinzaine où le nom court est absent — sortie en unité mobile. */
  herveum: "AG-REX-26",
  /* Emma du siège travaille à REX et n'est PAS Emma RASOLOMAMPIONONA : les
     deux figurent au planning les mêmes jours (11, 12, 13 et 14 août), et
     deux lignes du même jour ne peuvent désigner une seule personne. */
  emmasiege: "AG-REX-EMMASIEGE",
  // Prestataires, sans badge : le planning les reconnaît, la pointeuse non.
  profhaja: "AG-REX-HAJA",
  haja: "AG-REX-HAJA",
  mahefa: "AG-REX-MAHEFA",
  rsnoro: "AG-REX-NORO",
  noro: "AG-REX-NORO",

  /* ── RELEVÉS SUR LES CLASSEURS DE POINTAGE DE JUILLET ET AOÛT 2026 ──────
     Ces deux onglets ne se rattachaient à personne, et cent deux passages
     tombaient hors référentiel faute d'une lettre.

     « Marcelia » est TATAMOTIANA MARCELLIA HANITRINIAINA : deux L au
     référentiel, un seul sur l'onglet, 88 passages en août. « Arnaud » est
     SAFIDY ARNAULD, que le classeur d'août nomme d'ailleurs « Safidy »,
     lequel se rattachait déjà. Une seule fiche répond dans les deux cas :
     il n'y a aucun arbitrage à rendre.

     Ils vivent dans la table COMMUNE et non dans celle de REX : les
     classeurs de prestataires ne portent aucun site, si bien qu'une table
     conditionnée au centre ne serait jamais consultée pour eux. */
  marcelia: "AG-REX-1",
  arnaud: "AG-REX-30",

  /* « Niana » est ZAFINIAINA ROGER FANOMEZANTSOA, agent de sécurité à REX,
     identité donnée par la DRH le 1er septembre 2026.

     Aucune règle mécanique ne pouvait le trouver : le nom usuel n'est même
     pas une sous-chaîne du prénom, « Zafiniaina » portant un i de plus.
     C'est le même cas que « Lalao » dans « TINALALAO », et c'est
     précisément ce que cette table existe pour porter.

     VÉRIFIÉ PAR LES HEURES avant d'être écrit : les 34 passages de l'onglet
     « Niana » du classeur d'août 2026 se retrouvent tous à la minute chez
     AG-REX-18, sur des journées de 06h à 18h qui correspondent au poste.
     Une identité donnée de mémoire se confirme par la donnée : c'est une
     paie qu'on engage. */
  niana: "AG-REX-18",
};

/**
 * Noms cités aux plannings qui ne DOIVENT PAS entrer au référentiel.
 *
 * « Diricks » désigne des agents de sécurité extérieurs au centre : ils
 * tiennent un poste tous les après-midi mais ne relèvent pas de sa paie.
 * Les lister ici évite qu'un import les signale à chaque passage comme un
 * oubli — un avertissement qui revient sans jamais rien appeler finit par
 * être ignoré, et emporte les vrais avec lui.
 */
export const HORS_REFERENTIEL = new Set(["diricks"]);

/**
 * Noms usuels propres à REX.
 *
 * ── « Emma » SEUL, AU PLANNING DE REX ────────────────────────────────────
 * Trois fiches portent ce prénom, si bien qu'aucune règle mécanique ne peut
 * trancher. Quatre observations concordantes le font :
 *
 *  1. Sur les 93 feuilles-semaine du classeur REX, TOUTE mention d'« Emma »
 *     tombe dans une ligne « Nettoyage ». Aucune en consultation, en CPN ni
 *     en sénologie : Emma RAFENOSOA, sage-femme, est exclue d'office.
 *  2. Le classeur distingue lui-même ses deux Emma de ménage : « Emma REX »
 *     240 fois, « Emma (SIEGE) » 270 fois. Le mot nu est donc le résidu de
 *     la première, la seconde étant toujours qualifiée.
 *  3. AG-REX-14 est femme de ménage au service Logistique et maintenance.
 *     C'est le poste de la ligne.
 *  4. Ses pointages tombent l'après-midi (13:37-17:05, 13:55-17:03,
 *     13:46-17:00), exactement là où le planning écrit « Emma » nu tandis
 *     que le matin porte « Emma (siege) ». Emma du siège, elle, n'a aucun
 *     badge, et ne peut donc pas produire ces heures.
 *
 * L'alias est volontairement CANTONNÉ À REX. Le classeur de MIARAKA a lui
 * aussi une colonne « EMMA », dont rien ne dit qu'elle désigne la même
 * personne ; elle reste signalée pour arbitrage plutôt que rattachée par
 * ricochet.
 */
export const ALIAS_REX: Record<string, string> = {
  emma: "AG-REX-14", // Emma RASOLOMAMPIONONA, femme de ménage
  emmarex: "AG-REX-14",
  /* ── « NIRY » EST LA GÉNÉRALISTE, PAS LA COLLABORATRICE ────────────────
     Deux fiches répondent : Harinirina RANDRIAMAHENINA (AG-REX-34),
     généraliste au service sanitaire, et Niry Rovaniaina RAZAFIMAMONJY
     (AG-REX-28), collaboratrice en gestion logistique et suivi scolaire.
     La règle mécanique donne la seconde, dont c'est le prénom. Elle a tort.

     Le corpus tranche sans appel : « Niry » y paraît 869 fois, dont 866 en
     CONSULTATIONS, toujours titrée « Dr » ou « Dc ». Et « Harinirina »
     comme « Randriamahenina » n'apparaissent dans AUCUN planning : la
     généraliste n'y est jamais désignée autrement que par ce nom usuel.
     AG-REX-28, elle, n'a pas de poste médical.

     La collision est née de ma correction du 13 août, qui a rendu à
     AG-REX-28 son prénom véritable après la fusion des fiches. Corriger
     une donnée peut en fausser une autre : c'est pourquoi l'arbitrage
     s'écrit ici plutôt que de dépendre d'une règle générale. */
  niry: "AG-REX-34",
};

/** Noms usuels propres à MIARAKA : le même mot y désigne quelqu'un d'autre. */
export const ALIAS_MIARAKA: Record<string, string> = {
  feno: "AG-MIARAKA-21", // PHILBERT HERIFENOSOA
  philbert: "AG-MIARAKA-21",
  philibert: "AG-MIARAKA-21", // orthographe rectifiée par la DRH le 13/08
  toma: "AG-MIARAKA-24", // JEAN CHRYSOSTOME RAKOTONDRAZAFY
  tome: "AG-MIARAKA-24",
  fanja: "AG-MIARAKA-23",
  jeanclaude: "AG-MIARAKA-29",
  anico: "AG-MIARAKA-30",
  maurice: "AG-MIARAKA-31",
  germain: "AG-MIARAKA-28",
  cynthia: "AG-MIARAKA-14",
  fabienne: "AG-MIARAKA-26",
  jclaude: "AG-MIARAKA-29", // le planning écrit « J.CLAUDE »
  /* « Isabelle » désigne DEUX personnes selon le centre : à MIARAKA c'est
     la médecin généraliste Harinirina RANDRIAMAHENINA (l'import du brut de
     juillet le montre : identifiant 16, onglet « Isabelle »), à REX c'est
     Christine Isabelle RANDIMALALA. D'où la table par site. */
  isabelle: "AG-MIARAKA-16",
  /* « Lalao » est la fin de « TINALALAO », pas son début : aucune règle
     mécanique ne le trouve. */
  lalao: "AG-REX-22",
  /* « Rova » est bien Niry Rovaniaina RAZAFIMAMONJY. Elle est enrôlée sur
     les DEUX pointeuses — REX-28 et MIARAKA-17 — et le référentiel nommait
     par erreur la seconde « Jeanine RALAIVOAVY », ce qui a fait verser ses
     heures sur la fiche de Jeanine lors de la fusion du 13 août. Corrigé. */
  rova: "AG-REX-28",
  /* « Menja » est MANAMPISOA SUZANNE CLAUDINE NOMENJANAHARY. Son planning
     est tenu dans le classeur de MIARAKA, mais elle badge à REX sous
     l'identifiant 39 — 58 passages en mai, 92 en juin. La preuve est
     horaire : l'onglet « Menja » du classeur porte 8:06, 12:01, 13:54,
     16:00 le 1er juin, et ce sont à la seconde les passages d'AG-REX-39.
     Chercher son badge sur la seule pointeuse de son planning était une
     erreur : au centre, le lieu du badge ne dit pas le lieu du travail.
     On ne met PAS « nomenjanahary » en alias : Faniloniaina Nomenjanahary
     porte le même patronyme, et l'ambiguïté serait tranchée à tort. */
  menja: "AG-REX-39",
  naina: "AG-REX-18",
};

export interface AgentIdentifiable {
  id: string;
  prenom: string;
  nom: string;
  actif?: boolean;
}

export interface Resolution {
  agentId: string | null;
  /** Comment on y est arrivé — à afficher dans les rapports d'import. */
  voie: "alias" | "exact" | "unique" | "ambigu" | "inconnu";
  /** Les candidats, quand plusieurs répondent : à trancher par un humain. */
  candidats?: string[];
}

/**
 * Résout un nom usuel vers une fiche agent.
 *
 * `site` oriente vers la table d'alias de MIARAKA quand le document vient
 * de ce centre. Une correspondance qui désigne PLUSIEURS agents ne rend
 * rien : mieux vaut un nom non rattaché, visible dans le rapport d'import,
 * qu'un planning silencieusement collé à la mauvaise personne.
 */
export function resoudreAgent(
  usuel: string,
  agents: AgentIdentifiable[],
  site?: string,
): Resolution {
  const cle = normaliserUsuel(usuel);
  if (!cle) return { agentId: null, voie: "inconnu" };

  const vivants = agents.filter((a) => a.actif !== false);

  /**
   * Suit une fiche archivée jusqu'à celle qui l'a absorbée.
   *
   * Les fiches en double ont été fusionnées : `AG-MIARAKA-23` est devenue
   * `AG-REX-40`, même personne. Recopier les nouveaux identifiants dans les
   * tables d'alias marcherait aujourd'hui et casserait à la prochaine
   * fusion. On préfère retrouver la fiche vivante PAR LE NOM de la fiche
   * archivée : l'alias reste vrai quoi qu'il arrive au référentiel.
   */
  const vivant = (id: string): string | null => {
    const cible = agents.find((a) => a.id === id);
    if (!cible) return null;
    if (cible.actif !== false) return cible.id;
    const memeNom = vivants.find(
      (a) =>
        normaliserUsuel(`${a.prenom}${a.nom}`) === normaliserUsuel(`${cible.prenom}${cible.nom}`),
    );
    return memeNom?.id ?? null;
  };

  if (site === "MIARAKA" && ALIAS_MIARAKA[cle]) {
    const id = vivant(ALIAS_MIARAKA[cle]);
    if (id) return { agentId: id, voie: "alias" };
  }
  if (site === "REX" && ALIAS_REX[cle]) {
    const id = vivant(ALIAS_REX[cle]);
    if (id) return { agentId: id, voie: "alias" };
  }
  if (ALIAS_CENTRE[cle]) {
    const id = vivant(ALIAS_CENTRE[cle]);
    if (id) return { agentId: id, voie: "alias" };
  }

  // Correspondance exacte sur le prénom du référentiel.
  const exacts = vivants.filter((a) => normaliserUsuel(a.prenom) === cle);
  if (exacts.length === 1) return { agentId: exacts[0].id, voie: "exact" };

  /* À défaut, le nom usuel doit apparaître comme un MOT du nom complet, ou
     comme son début — « Haingo » pour « HAINGOTIANA ». On exige quatre
     lettres : « Ana » se retrouverait dans la moitié du référentiel. */
  if (cle.length >= 4) {
    const candidats = vivants.filter((a) =>
      `${a.prenom} ${a.nom}`
        .split(/\s+/)
        .some((mot) => {
          const m = normaliserUsuel(mot);
          return m === cle || m.startsWith(cle);
        }),
    );
    if (candidats.length === 1) return { agentId: candidats[0].id, voie: "unique" };
    if (candidats.length > 1) {
      return {
        agentId: null,
        voie: "ambigu",
        candidats: candidats.map((a) => `${a.id} ${a.prenom} ${a.nom}`.trim()),
      };
    }
  }

  return { agentId: null, voie: "inconnu" };
}
