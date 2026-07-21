import { google, sheets_v4 } from "googleapis";

/* ============================================================
   GOOGLE SHEETS API CLIENT
   ============================================================
   Source de vérité de l'app. Utilise un service account Google Cloud.
   Variables d'env requises (voir .env.example) :
   - GOOGLE_SHEET_ID             id du Spreadsheet
   - GOOGLE_SERVICE_ACCOUNT_EMAIL
   - GOOGLE_PRIVATE_KEY          (avec \\n échappés)
*/

export const SHEETS = {
  config: "config",
  users: "users",
  sites: "sites",
  rooms: "rooms",
  materials: "materials",
  sessions: "sessions",
  movements: "movements",
  trash: "trash",
  auditLog: "audit_log",
  network: "network",
} as const;
export type SheetName = (typeof SHEETS)[keyof typeof SHEETS];

let _client: sheets_v4.Sheets | null = null;
let _spreadsheetId: string | null = null;

function getEnv() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!spreadsheetId || !clientEmail || !rawKey) {
    throw new Error(
      "Google Sheets non configuré. Définissez GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL et GOOGLE_PRIVATE_KEY.",
    );
  }

  // Vercel encode les clés avec \n littéraux — on les restaure
  const privateKey = rawKey.replace(/\\n/g, "\n");
  return { spreadsheetId, clientEmail, privateKey };
}

export function getSheetsClient(): sheets_v4.Sheets {
  if (_client) return _client;
  const { clientEmail, privateKey } = getEnv();
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  _client = google.sheets({ version: "v4", auth });
  return _client;
}

export function getSpreadsheetId(): string {
  if (_spreadsheetId) return _spreadsheetId;
  _spreadsheetId = getEnv().spreadsheetId;
  return _spreadsheetId;
}

/* ============================================================
   BASCULE PAR ONGLET
   ============================================================
   `LOGISTIQUE_SUPABASE_TABS` liste les onglets servis par Supabase, séparés
   par des virgules (ex. "sites,rooms"). Vide ou absent = tout sur Google
   Sheets, c'est-à-dire le comportement d'aujourd'hui.

   Onglet par onglet, et non tout d'un coup : on migre d'abord ce qui est en
   lecture seule (sites, rooms), on observe, et `users` — qui porte
   l'authentification — passe en dernier, seul, quand le reste a fait ses
   preuves. Le retour arrière consiste à retirer un mot de la variable.
*/
function tabsSupabase(): Set<string> {
  const raw = process.env.LOGISTIQUE_SUPABASE_TABS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Vrai si cet onglet doit être servi par Supabase. */
export function estSurSupabase(sheet: SheetName): boolean {
  return tabsSupabase().has(sheet);
}

/**
 * Lit toutes les lignes d'un onglet. Retourne un tableau d'objets
 * (clés = en-têtes de la ligne 1).
 */
export async function readSheet<T extends Record<string, unknown>>(
  sheet: SheetName,
  range?: string,
): Promise<T[]> {
  // `range` ne sert qu'aux lectures partielles côté Sheets ; aucun appelant
  // ne le combine avec un onglet migré.
  if (!range && estSurSupabase(sheet)) {
    const { readTabSupabase } = await import("./supabase-backend");
    return readTabSupabase<T>(sheet);
  }
  const client = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const res = await client.spreadsheets.values.get({
    spreadsheetId,
    range: range ?? `${sheet}!A1:ZZ`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const rows = res.data.values ?? [];
  if (rows.length === 0) return [];
  const [headers, ...data] = rows as [string[], ...unknown[][]];
  return data.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? null;
    });
    return obj as T;
  });
}

/** Ajoute une ligne à un onglet (append). */
export async function appendRow(
  sheet: SheetName,
  values: unknown[],
): Promise<void> {
  if (estSurSupabase(sheet)) {
    const { appendRowSupabase } = await import("./supabase-backend");
    return appendRowSupabase(sheet, values);
  }
  const client = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  await client.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheet}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

/** Met à jour une ligne existante. */
export async function updateRow(
  sheet: SheetName,
  rowIndex: number, // 1-based (2 = première ligne de données si la ligne 1 = headers)
  values: unknown[],
): Promise<void> {
  // Un numéro de ligne n'a AUCUN sens côté Supabase : écrire ici sur un
  // onglet migré modifierait le Sheet gelé, que plus personne ne lit —
  // une écriture qui « réussit » mais n'existe pas. On refuse fort.
  if (estSurSupabase(sheet)) {
    throw new Error(
      `"${sheet}" est servi par Supabase : updateRow(rowIndex) est une primitive Sheets — passer par updateRowById`,
    );
  }
  const client = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheet}!A${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

/* ============================================================
   ADRESSAGE PAR ID
   ============================================================
   Une ligne se désigne par son `id` (colonne A), jamais par sa position.
   Le numéro de ligne est un détail d'implémentation de Google Sheets qui
   ne doit pas fuir hors de ce fichier : Supabase n'en a pas, et une ligne
   insérée ou supprimée entre la lecture et l'écriture ferait écrire sur
   la mauvaise ligne — donc sur le mauvais utilisateur.
*/

/**
 * Décide du numéro de ligne (1-based) à partir de la colonne A déjà lue.
 * Partie pure, séparée de l'appel réseau pour être testable telle quelle —
 * c'est ici que se joue le choix de la ligne qu'on va écraser.
 *
 * Lève plutôt que de renvoyer une cible douteuse : sur l'onglet `users`,
 * une mauvaise cible réécrit le compte de quelqu'un d'autre.
 *
 * @param colonneA les valeurs brutes de la colonne A, en-tête compris
 */
export function pickRowIndex(
  colonneA: unknown[][],
  id: string,
  sheet: string,
): number {
  // 1. Un id vide résoudrait vers la première ligne blanche de l'onglet
  //    (voir `.map()` ci-dessous) et on écrirait dedans. Barrière en premier.
  if (!id || !String(id).trim()) {
    throw new Error(`Identifiant vide : refus d'écrire dans "${sheet}"`);
  }

  // 2. `.map()` et non `.flat()` : une ligne vide au milieu de l'onglet a une
  //    case A vide, que .flat() FAIT DISPARAÎTRE — tous les index suivants se
  //    décalent alors d'un cran et l'écriture atterrit une ligne trop haut.
  //    .map() préserve la correspondance index ↔ ligne.
  const ids = colonneA.map((r) => String(r?.[0] ?? ""));

  const idx = ids.indexOf(id);
  // 3. L'index 0 est la ligne d'en-têtes : jamais une donnée.
  if (idx <= 0) throw new Error(`Identifiant "${id}" introuvable dans "${sheet}"`);

  // 4. Deux lignes portant le même id : impossible de choisir. On refuse
  //    d'écrire plutôt que de modifier arbitrairement la première.
  const doublon = ids.indexOf(id, idx + 1);
  if (doublon > 0) {
    throw new Error(
      `Identifiant "${id}" en double dans "${sheet}" (lignes ${idx + 1} et ${doublon + 1}) : refus d'écrire`,
    );
  }

  return idx + 1; // 1-based : la ligne 1 étant l'en-tête, idx 1 → ligne 2
}

/** Lit la colonne A de l'onglet et y trouve la ligne portant cet `id`. */
async function resolveRowIndex(sheet: SheetName, id: string): Promise<number> {
  // La garde sur l'id vide vaut avant même de payer un appel réseau.
  if (!id || !String(id).trim()) {
    throw new Error(`Identifiant vide : refus d'écrire dans "${sheet}"`);
  }
  const client = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const res = await client.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheet}!A:A`,
  });
  return pickRowIndex(res.data.values ?? [], id, sheet);
}

/** Met à jour la ligne portant cet `id`. */
export async function updateRowById(
  sheet: SheetName,
  id: string,
  values: unknown[],
): Promise<void> {
  if (estSurSupabase(sheet)) {
    const { updateRowByIdSupabase } = await import("./supabase-backend");
    return updateRowByIdSupabase(sheet, id, values);
  }
  const rowIndex = await resolveRowIndex(sheet, id);
  await updateRow(sheet, rowIndex, values);
}

/** Supprime définitivement la ligne portant cet `id`. */
export async function deleteRowById(sheet: SheetName, id: string): Promise<void> {
  if (estSurSupabase(sheet)) {
    const { deleteRowByIdSupabase } = await import("./supabase-backend");
    return deleteRowByIdSupabase(sheet, id);
  }
  const rowIndex = await resolveRowIndex(sheet, id);
  await deleteRow(sheet, rowIndex);
}

/**
 * Supprime physiquement une ligne d'un onglet (hard delete).
 * Contrairement à `values.clear` qui laisse une ligne vide,
 * ceci utilise batchUpdate/deleteDimension pour retirer complètement la ligne.
 */
export async function deleteRow(
  sheet: SheetName,
  rowIndex: number, // 1-based (même convention que updateRow)
): Promise<void> {
  // Même garde que updateRow : pas de numéro de ligne côté Supabase.
  if (estSurSupabase(sheet)) {
    throw new Error(
      `"${sheet}" est servi par Supabase : deleteRow(rowIndex) est une primitive Sheets — passer par deleteRowById`,
    );
  }
  const client = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  // Récupération du sheetId numérique (différent du nom de l'onglet)
  const meta = await client.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });
  const target = meta.data.sheets?.find((s) => s.properties?.title === sheet);
  const sheetId = target?.properties?.sheetId;
  if (sheetId == null) {
    throw new Error(`Onglet "${sheet}" introuvable dans le spreadsheet`);
  }

  await client.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowIndex - 1, // conversion 1-based → 0-based
              endIndex: rowIndex,
            },
          },
        },
      ],
    },
  });
}
