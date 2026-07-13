import { google, sheets_v4 } from "googleapis";

import {
  Produit,
  Lot,
  Mouvement,
  type ProduitAvecStock,
} from "./types";

/* ============================================================
   PHARMACIE — Accès Google Sheets
   Spreadsheet séparé de la Logistique (PHARMACIE_SHEET_ID) pour
   isoler quotas API et permissions.
   ============================================================ */

export const PHARMA_SHEETS = {
  produits: "produits",
  lots: "lots",
  mouvements: "mouvements",
  ventes: "ventes",
  lignesVente: "lignes_vente",
  fournisseurs: "fournisseurs",
  parametres: "parametres",
} as const;
export type PharmaSheetName = (typeof PHARMA_SHEETS)[keyof typeof PHARMA_SHEETS];

let _client: sheets_v4.Sheets | null = null;

function getEnv() {
  const spreadsheetId = process.env.PHARMACIE_SHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!spreadsheetId || !clientEmail || !rawKey) {
    throw new Error(
      "Pharmacie non configurée. Définissez PHARMACIE_SHEET_ID (+ credentials service account).",
    );
  }
  return {
    spreadsheetId,
    clientEmail,
    privateKey: rawKey.replace(/\\n/g, "\n"),
  };
}

function getClient(): sheets_v4.Sheets {
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

async function readTab<T extends Record<string, unknown>>(
  tab: PharmaSheetName,
): Promise<T[]> {
  const res = await getClient().spreadsheets.values.get({
    spreadsheetId: getEnv().spreadsheetId,
    range: `${tab}!A1:ZZ`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const rows = res.data.values ?? [];
  if (rows.length === 0) return [];
  const [headers, ...data] = rows as [string[], ...unknown[][]];
  return data
    .filter((row) => row.some((c) => c !== null && c !== ""))
    .map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] ?? "";
      });
      return obj as T;
    });
}

/** Ajoute des lignes en fin d'onglet (append-only, sans conflit). */
export async function appendRows(
  tab: PharmaSheetName,
  values: unknown[][],
): Promise<void> {
  await getClient().spreadsheets.values.append({
    spreadsheetId: getEnv().spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

/**
 * Enregistre une vente complète : entête + lignes + mouvements négatifs.
 * Trois appends séquentiels ; les mouvements en DERNIER pour que le
 * stock ne décrémente qu'une fois la vente réellement tracée.
 */
export async function enregistrerVente(input: {
  venteRow: unknown[];
  lignesRows: unknown[][];
  mouvementsRows: unknown[][];
}): Promise<void> {
  await appendRows(PHARMA_SHEETS.ventes, [input.venteRow]);
  await appendRows(PHARMA_SHEETS.lignesVente, input.lignesRows);
  await appendRows(PHARMA_SHEETS.mouvements, input.mouvementsRows);
}

// ------------------------------------------------------------------
// Lectures typées
// ------------------------------------------------------------------

export async function listProduits(): Promise<Produit[]> {
  const rows = await readTab(PHARMA_SHEETS.produits);
  return rows
    .map((r) => Produit.safeParse(r))
    .filter((p) => p.success)
    .map((p) => p.data);
}

export async function listLots(): Promise<Lot[]> {
  const rows = await readTab(PHARMA_SHEETS.lots);
  return rows
    .map((r) => Lot.safeParse(r))
    .filter((p) => p.success)
    .map((p) => p.data);
}

export async function listMouvements(): Promise<Mouvement[]> {
  const rows = await readTab(PHARMA_SHEETS.mouvements);
  return rows
    .map((r) => Mouvement.safeParse(r))
    .filter((p) => p.success)
    .map((p) => p.data);
}

// ------------------------------------------------------------------
// Stock calculé (jamais stocké)
// ------------------------------------------------------------------

/** Nombre de jours entre aujourd'hui et une date ISO (négatif = passé). */
function daysUntil(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - Date.now()) / 86_400_000);
}

/**
 * Produits enrichis : stock = Σ mouvements.quantite (signés),
 * prochaine péremption = date de lot la plus proche.
 */
export async function listProduitsAvecStock(): Promise<ProduitAvecStock[]> {
  const [produits, lots, mouvements] = await Promise.all([
    listProduits(),
    listLots(),
    listMouvements(),
  ]);

  const stockParProduit = new Map<string, number>();
  for (const m of mouvements) {
    stockParProduit.set(
      m.produit_id,
      (stockParProduit.get(m.produit_id) ?? 0) + m.quantite,
    );
  }

  const peremptionParProduit = new Map<string, string>();
  for (const lot of lots) {
    if (!lot.date_expiration) continue;
    const current = peremptionParProduit.get(lot.produit_id);
    if (!current || lot.date_expiration < current) {
      peremptionParProduit.set(lot.produit_id, lot.date_expiration);
    }
  }

  return produits.map((p) => {
    const prochainePeremption = peremptionParProduit.get(p.id) ?? null;
    return {
      ...p,
      stock: stockParProduit.get(p.id) ?? 0,
      prochainePeremption,
      joursAvantPeremption: prochainePeremption
        ? daysUntil(prochainePeremption)
        : null,
    };
  });
}
