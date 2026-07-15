import type { SheetName } from "./client";

/* ============================================================
   ORDRE DES COLONNES — contrat unique entre les deux backends
   ============================================================

   Google Sheets écrit une ligne par POSITION (un tableau brut), Supabase
   par NOM. Cette table est le seul endroit qui fait le lien, et l'ordre y
   est celui, réel, des en-têtes du Sheet — relevé le 15/07/2026, pas
   recopié des commentaires du code (qui annonçaient 32 colonnes pour
   `materials` alors que le Sheet en a 33 : biosDate y manquait).

   ⚠️ AJOUT EN FIN DE LISTE UNIQUEMENT. Insérer une colonne au milieu
   décalerait toutes les suivantes lors des écritures Sheets, silencieusement.
*/

export const COLUMN_ORDER: Record<SheetName, readonly string[]> = {
  users: ["id", "email", "passwordHash", "name", "role", "lang", "active", "createdAt", "lastLoginAt", "invitedBy"],
  sites: ["id", "code", "name", "city", "address", "active"],
  rooms: ["id", "siteId", "code", "name", "floor", "service", "ipRange"],
  materials: [
    "id", "ref", "type", "designation", "brand", "model", "serialNumber",
    "siteId", "roomId", "service", "owner", "assignedTo",
    "purchaseDate", "purchasePrice", "amortization",
    "os", "cpu", "ram", "storage",
    "ipAddress", "macAddress", "internetAccess", "linkedToBDD",
    "state", "notes", "photos",
    "quantity2023", "quantity2024", "quantity2025",
    "createdAt", "updatedAt", "deletedAt", "biosDate",
  ],
  sessions: ["id", "materialId", "sessionName", "encryptedPassword", "passwordIv", "passwordTag", "assignedUser", "isAdmin", "notes", "createdAt", "updatedAt"],
  movements: ["id", "materialId", "type", "fromSiteId", "fromRoomId", "fromAssignedTo", "toSiteId", "toRoomId", "toAssignedTo", "byUserId", "reason", "date"],
  audit_log: ["id", "userId", "userEmail", "action", "targetType", "targetId", "details", "ip", "userAgent", "timestamp"],
  config: ["key", "value", "description"],
  trash: ["id", "originalSheet", "originalId", "snapshot", "deletedBy", "deletedAt", "reason"],
  network: ["id", "siteId", "roomId", "type", "name", "encryptedPassword", "passwordIv", "passwordTag", "ipAddress", "notes"],
};

/**
 * Colonne servant de clé primaire, par onglet.
 * `config` n'a pas d'`id` : sa clé EST le nom du paramètre.
 */
export const PRIMARY_KEY: Record<SheetName, string> = {
  users: "id",
  sites: "id",
  rooms: "id",
  materials: "id",
  sessions: "id",
  movements: "id",
  audit_log: "id",
  config: "key",
  trash: "id",
  network: "id",
};

/** Colonnes numériques : une cellule vide y vaut « non renseigné » (null). */
export const NUMERIC_COLS: Partial<Record<SheetName, ReadonlySet<string>>> = {
  materials: new Set(["purchasePrice", "quantity2023", "quantity2024", "quantity2025"]),
};

/**
 * Colonnes booléennes. Sheets renvoie un vrai booléen quand la cellule est
 * une case à cocher, la chaîne "TRUE"/"FALSE" sinon ; Postgres exige un
 * booléen. `nullable` distingue les tri-états (oui / non / on ne sait pas)
 * des colonnes qui doivent trancher.
 */
export const BOOLEAN_COLS: Partial<Record<SheetName, Record<string, { nullable: boolean }>>> = {
  users: { active: { nullable: false } },
  sites: { active: { nullable: false } },
  sessions: { isAdmin: { nullable: false } },
  materials: {
    internetAccess: { nullable: true },
    linkedToBDD: { nullable: true },
  },
};

/**
 * Vérifie qu'un tableau positionnel a bien la longueur attendue.
 *
 * Les sérialiseurs (userToRow, materialToRow…) construisent leurs tableaux
 * à la main : si l'un oublie une valeur, Sheets décale simplement les
 * colonnes SANS ERREUR, et la donnée atterrit dans la mauvaise. Ici on
 * s'arrête net plutôt que de corrompre une ligne en silence.
 */
export function assertRowLength(sheet: SheetName, values: unknown[]): void {
  const attendu = COLUMN_ORDER[sheet].length;
  if (values.length !== attendu) {
    throw new Error(
      `Ligne "${sheet}" mal formée : ${values.length} valeur(s) pour ${attendu} colonne(s). ` +
        `Le sérialiseur et COLUMN_ORDER ont divergé — écriture refusée.`,
    );
  }
}
