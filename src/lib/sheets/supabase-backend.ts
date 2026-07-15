import { sbSelect, sbInsert, sbUpdate, sbDelete } from "@/lib/supabase-server";
import type { SheetName } from "./client";
import {
  COLUMN_ORDER,
  PRIMARY_KEY,
  NUMERIC_COLS,
  BOOLEAN_COLS,
  assertRowLength,
} from "./columns";

/* ============================================================
   BACKEND SUPABASE — miroir des primitives Google Sheets
   ============================================================

   Ces fonctions ont la MÊME signature que celles de client.ts et
   renvoient la même forme de données : les colonnes Supabase portent
   exactement les noms des en-têtes du Sheet, donc les modules métier
   (users.ts, materials.ts…) ne savent pas quel backend les sert.

   Toute la logique métier reste en un seul exemplaire. Seules ces
   primitives sont dupliquées — c'est le même motif que la pharmacie,
   qui a fait ses preuves.
*/

const SCHEMA = "logistique";

/** Convertit une valeur de cellule vers ce qu'attend Postgres. */
function versColonne(sheet: SheetName, col: string, v: unknown): unknown {
  const bools = BOOLEAN_COLS[sheet]?.[col];
  if (bools) {
    // Sheets renvoie un booléen (case à cocher) ou "TRUE"/"FALSE" (texte).
    if (v === null || v === undefined || v === "") return bools.nullable ? null : false;
    if (typeof v === "boolean") return v;
    const s = String(v).toUpperCase();
    if (s === "TRUE" || s === "OUI" || s === "YES" || s === "1") return true;
    if (s === "FALSE" || s === "NON" || s === "NO" || s === "0") return false;
    return bools.nullable ? null : false;
  }
  if (NUMERIC_COLS[sheet]?.has(col)) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  // Colonne TEXTE : le vide s'écrit "" et JAMAIS null — ces colonnes sont
  // NOT NULL en base, un null y échouerait en 23502. C'est exactement le
  // piège qui a cassé les ventes de la pharmacie.
  return v === null || v === undefined ? "" : String(v);
}

/** Tableau positionnel → objet nommé, prêt pour PostgREST. */
function versObjet(sheet: SheetName, values: unknown[]): Record<string, unknown> {
  assertRowLength(sheet, values);
  const obj: Record<string, unknown> = {};
  COLUMN_ORDER[sheet].forEach((col, i) => {
    obj[col] = versColonne(sheet, col, values[i]);
  });
  return obj;
}

/** Lit tout un onglet. Renvoie la même forme que readSheet (client.ts). */
export async function readTabSupabase<T extends Record<string, unknown>>(
  sheet: SheetName,
): Promise<T[]> {
  // Le nom de l'onglet est aussi celui de la table : la migration les a
  // volontairement fait coïncider.
  const pk = PRIMARY_KEY[sheet];
  const page = 1000;
  const all: T[] = [];
  for (let offset = 0; ; offset += page) {
    // `order` explicite : un LIMIT/OFFSET sans ORDER BY n'a aucun ordre
    // garanti en Postgres — au-delà d'une page, des lignes pourraient être
    // dupliquées ou omises, silencieusement.
    const { rows } = await sbSelect<T>(SCHEMA, sheet, {
      select: "*",
      order: `${pk}.asc`,
      limit: page,
      offset,
    });
    all.push(...rows);
    if (rows.length < page) break;
  }
  return all;
}

/** Ajoute une ligne. */
export async function appendRowSupabase(
  sheet: SheetName,
  values: unknown[],
): Promise<void> {
  await sbInsert(SCHEMA, sheet, [versObjet(sheet, values)]);
}

/** Met à jour la ligne portant cette clé. */
export async function updateRowByIdSupabase(
  sheet: SheetName,
  id: string,
  values: unknown[],
): Promise<void> {
  if (!id || !String(id).trim()) {
    throw new Error(`Identifiant vide : refus d'écrire dans "${sheet}"`);
  }
  const patch = versObjet(sheet, values);
  const n = await sbUpdate(SCHEMA, sheet, { [PRIMARY_KEY[sheet]]: `eq.${id}` }, patch);
  if (n === 0) throw new Error(`Identifiant "${id}" introuvable dans "${sheet}"`);
}

/** Supprime la ligne portant cette clé. */
export async function deleteRowByIdSupabase(
  sheet: SheetName,
  id: string,
): Promise<void> {
  if (!id || !String(id).trim()) {
    throw new Error(`Identifiant vide : refus de supprimer dans "${sheet}"`);
  }
  await sbDelete(SCHEMA, sheet, { [PRIMARY_KEY[sheet]]: `eq.${id}` });
}
