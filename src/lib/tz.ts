/* ============================================================
   FUSEAU HORAIRE DES CENTRES
   ============================================================
   Les serveurs (Vercel) tournent en UTC. Sans fuseau explicite, un
   `toLocaleString()` exécuté côté serveur affiche donc l'heure de Londres :
   une vente de 15h00 à Fianarantsoa apparaît à 12h00. Le décalage passe
   inaperçu sur une date, mais fausse toute lecture d'un horaire.

   Madagascar est à UTC+3 toute l'année — aucun changement d'heure d'été —
   ce qui rend la conversion sûre et sans cas particulier.

   ⚠️ À ne PAS appliquer aux pointages : leur horodatage est déjà enregistré
   en heure locale de la pointeuse (« 2026-07-28 08:11:10 »), pas en UTC.
   Les convertir une seconde fois ajouterait trois heures.
   ============================================================ */

export const TZ = "Indian/Antananarivo";

type Lang = "fr" | "it";
const locale = (lang: Lang) => (lang === "it" ? "it-IT" : "fr-FR");

/** Date seule, à l'heure des centres. */
export function formaterDate(iso: string | undefined, lang: Lang = "fr"): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(locale(lang), {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: TZ,
    });
  } catch {
    return iso;
  }
}

/** Date et heure, à l'heure des centres. */
export function formaterDateHeure(iso: string | undefined, lang: Lang = "fr"): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(locale(lang), {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: TZ,
    });
  } catch {
    return iso;
  }
}

/** Heure seule "HH:MM", à l'heure des centres. */
export function formaterHeure(iso: string | undefined, lang: Lang = "fr"): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString(locale(lang), {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: TZ,
    });
  } catch {
    return iso;
  }
}

/** Jour courant "YYYY-MM-DD" aux centres, quel que soit le fuseau du serveur. */
export function aujourdhui(): string {
  // en-CA rend directement le format ISO, sans recomposition manuelle.
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
