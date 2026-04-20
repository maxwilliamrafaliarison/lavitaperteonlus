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

/**
 * Lit toutes les lignes d'un onglet. Retourne un tableau d'objets
 * (clés = en-têtes de la ligne 1).
 */
export async function readSheet<T extends Record<string, unknown>>(
  sheet: SheetName,
  range?: string,
): Promise<T[]> {
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
  const client = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheet}!A${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
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
