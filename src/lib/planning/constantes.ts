/* ============================================================
   PLANNING — constantes du domaine
   ============================================================
   Module sans dépendance : il peut être importé aussi bien par un module
   pur que par un composant serveur, sans jamais créer de cycle.
   ============================================================ */

/**
 * Préfixe des POSTES À POURVOIR : une affectation sans titulaire.
 *
 * Ouvrir un poste sans savoir qui le tiendra est un acte de planification
 * courant, et le planning doit pouvoir le porter. Le titulaire est donc un
 * agent fictif, reconnaissable à ce préfixe, plutôt qu'un champ vide qui se
 * confondrait avec une donnée manquante.
 *
 * La constante vit ICI plutôt qu'à côté de l'un de ses usages : elle était
 * déclarée dans le contrôle légal et redéclarée dans le module des
 * remplacements, deux fichiers qui doivent s'accorder au caractère près.
 * Deux copies d'une même règle finissent toujours par diverger.
 */
export const PREFIXE_ATTENTE = "__attente-";

/** Un poste ouvert que personne ne tient encore. */
export function estPosteAPourvoir(agentId: string): boolean {
  return agentId.startsWith(PREFIXE_ATTENTE);
}

/**
 * Identité d'une affectation.
 *
 * Elle vit ICI et non à côté des actions : un module « use server » ne peut
 * exporter que des fonctions asynchrones, chacune devenant un point d'entrée
 * HTTP. Une fonction pure y est refusée à la compilation, et c'est une bonne
 * règle.
 *
 * ── ELLE ENCODE LE TITULAIRE, ET C'EST STRUCTURANT ───────────────────────
 * L'identifiant est DÉDUIT du contenu plutôt que tiré au sort : la grille
 * peut ainsi retrouver une case sans avoir lu la ligne, et réenregistrer
 * deux fois la même journée corrige au lieu d'empiler des doublons.
 *
 * Le revers est qu'un changement de titulaire doit RÉÉCRIRE l'identifiant.
 * Ne changer que `agent_id` laisse une ligne dont l'id nomme quelqu'un
 * d'autre : la grille ne sait plus l'atteindre, un glisser-déposer en crée
 * un double, et rouvrir la case échoue sur l'index d'unicité. La fabrique
 * vit donc ici, seule, pour que tous les chemins d'écriture s'accordent.
 */
export function idAffectation(
  planningId: string,
  jour: string,
  agentId: string,
  serviceId: string,
): string {
  return `AFF-${planningId}-${jour.replace(/-/g, "")}-${agentId}-${serviceId || "x"}`;
}
