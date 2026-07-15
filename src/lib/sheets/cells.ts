import { z } from "zod";

/* ============================================================
   LECTURE DE CELLULES — helpers tolérants aux formes vides
   ============================================================

   POURQUOI CE MODULE

   Une cellule vide de Google Sheets nous parvient sous DEUX formes
   différentes, pour la même colonne, selon la ligne :

   - `""`   quand une colonne PLUS LOIN dans la ligne est remplie ;
   - `null` quand la cellule est en fin de ligne — l'API Sheets TRONQUE
            les cellules vides finales, et `readSheet` comble avec `null`
            (client.ts : `obj[h] = row[i] ?? null`).

   Constaté sur l'onglet `materials` (33 colonnes) : 227 lignes arrivent
   avec 31 valeurs, 17 avec 32, 16 avec 33. La colonne `deletedAt` vaut
   donc `null` sur les unes et `""` sur les autres — même colonne, même
   sens, deux représentations.

   Supabase, lui, renvoie systématiquement `null`. Ces helpers rendent les
   lecteurs indifférents aux trois formes (`null`, `undefined`, `""`), ce
   qui est le prérequis d'une bascule sans surprise.

   LE PIÈGE QU'ILS SUPPRIMENT

       String(row.type) || "autre"

   `String(null)` vaut la chaîne "null" — qui est truthy. Le repli ne se
   déclenche donc JAMAIS, et une ligne tronquée produit le type "null".
   Écrire `str(row.type, "autre")` teste la valeur AVANT de la convertir.
*/

/** Vrai si la cellule est vide, quelle que soit sa représentation. */
export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/**
 * Cellule texte avec repli. Le repli s'applique aux trois formes vides.
 * À utiliser partout où l'on écrivait `String(x) || "defaut"` — qui ne
 * marchait pas sur `null` (voir l'en-tête du module).
 */
export function str(v: unknown, fallback = ""): string {
  return isBlank(v) ? fallback : String(v);
}

/** Cellule texte optionnelle : toute forme vide devient `undefined`. */
export function opt(v: unknown): string | undefined {
  return isBlank(v) ? undefined : String(v);
}

/**
 * Cellule booléenne. Sheets renvoie un vrai booléen quand la cellule est
 * une case à cocher (USER_ENTERED convertit "TRUE" en booléen), et une
 * chaîne sinon — d'où la double reconnaissance.
 */
export function bool(v: unknown): boolean | undefined {
  if (isBlank(v)) return undefined;
  if (typeof v === "boolean") return v;
  const s = String(v).toUpperCase();
  if (s === "TRUE" || s === "OUI" || s === "YES" || s === "1") return true;
  if (s === "FALSE" || s === "NON" || s === "NO" || s === "0") return false;
  return undefined;
}

/** Cellule numérique optionnelle. Une valeur non numérique vaut `undefined`. */
export function num(v: unknown): number | undefined {
  if (isBlank(v)) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Cellule appartenant à une énumération Zod (rôle, état, type…).
 * Une valeur vide OU inconnue retombe sur le repli — indispensable pour
 * les colonnes qui pilotent des droits : une valeur inattendue ne doit
 * jamais se propager telle quelle dans l'application.
 *
 * On valide contre l'énumération elle-même plutôt que contre une liste
 * recopiée, pour qu'un ajout de valeur ne puisse pas être oublié ici.
 */
export function enumOr<T extends string>(
  v: unknown,
  schema: z.ZodType<T>,
  fallback: T,
): T {
  if (isBlank(v)) return fallback;
  const r = schema.safeParse(String(v));
  return r.success ? r.data : fallback;
}

/** Cellule « liste séparée par des virgules » → tableau (vide si blanc). */
export function list(v: unknown): string[] {
  if (isBlank(v)) return [];
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
