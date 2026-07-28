/**
 * Circuit de validation des plannings.
 *
 * Aliniaina RAJOELISON (responsable administratif) prépare et SOUMET ; la
 * publication vers le personnel n'intervient qu'après validation du
 * Dr Elisa SALA. Les administrateurs gardent la main en secours : un circuit
 * qui se bloque quand la validatrice est indisponible pousserait à le
 * contourner.
 *
 * La liste est ici, dans un module partagé, pour que les actions serveur et
 * les écrans lisent LA MÊME règle — deux copies finiraient par diverger.
 */
export const VALIDATEURS = ["direction.lavitaperte@gmail.com"];

export function estValidateur(role: string | undefined, email: string | null | undefined): boolean {
  return role === "admin" || VALIDATEURS.includes((email ?? "").toLowerCase());
}

/** Libellé humain d'un statut de planning. */
export function libelleStatut(statut: string): string {
  switch (statut) {
    case "publie":
      return "Publié";
    case "a_valider":
      return "En validation";
    case "archive":
      return "Archive";
    default:
      return "Brouillon";
  }
}
