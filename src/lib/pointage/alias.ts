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
};

/** Noms usuels propres à MIARAKA : le même mot y désigne quelqu'un d'autre. */
export const ALIAS_MIARAKA: Record<string, string> = {
  feno: "AG-MIARAKA-21", // PHILBERT HERIFENOSOA
  philbert: "AG-MIARAKA-21",
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
  /* Menja n'a pas de badge : les quatorze identifiants enrôlés sur la
     pointeuse MIARAKA ne comptent pas le sien. Sa fiche n'existe que pour
     que le planning la reconnaisse. */
  menja: "AG-MIARAKA-MENJA",
  nomenjanahary: "AG-MIARAKA-MENJA",
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
