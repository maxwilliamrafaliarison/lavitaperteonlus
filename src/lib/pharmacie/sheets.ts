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
// Vente complète (pour ticket / facture)
// ------------------------------------------------------------------

export interface VenteComplete {
  id: string;
  timestamp: string;
  clientNom: string;
  typeVente: string;
  total: number;
  operateurEmail: string;
  statut: string;
  lignes: Array<{
    produitId: string;
    lotId: string;
    designation: string;
    dosage: string;
    quantite: number;
    prixUnitaire: number;
    sousTotal: number;
  }>;
}

export async function getVenteComplete(
  venteId: string,
): Promise<VenteComplete | null> {
  const [ventes, lignes, produits] = await Promise.all([
    readTab<Record<string, unknown>>(PHARMA_SHEETS.ventes),
    readTab<Record<string, unknown>>(PHARMA_SHEETS.lignesVente),
    listProduits(),
  ]);

  const vente = ventes.find((v) => v.id === venteId);
  if (!vente) return null;

  const parId = new Map(produits.map((p) => [p.id, p]));
  const venteLignes = lignes
    .filter((l) => l.vente_id === venteId)
    .map((l) => {
      const produit = parId.get(String(l.produit_id ?? ""));
      return {
        produitId: String(l.produit_id ?? ""),
        lotId: String(l.lot_id ?? ""),
        designation: produit?.designation ?? String(l.produit_id ?? "?"),
        dosage: produit?.dosage ?? "",
        quantite: Number(l.quantite ?? 0),
        prixUnitaire: Number(l.prix_unitaire ?? 0),
        sousTotal: Number(l.sous_total ?? 0),
      };
    });

  return {
    id: String(vente.id),
    timestamp: String(vente.timestamp ?? ""),
    clientNom: String(vente.client_nom ?? ""),
    typeVente: String(vente.type_vente ?? "cash"),
    total: Number(vente.total ?? 0),
    operateurEmail: String(vente.operateur_email ?? ""),
    statut: String(vente.statut ?? "active"),
    lignes: venteLignes,
  };
}

/** Paramètres clé/valeur de l'onglet parametres. */
export async function listParametres(): Promise<Map<string, string>> {
  const rows = await readTab<{ cle: unknown; valeur: unknown }>(
    PHARMA_SHEETS.parametres,
  );
  return new Map(
    rows
      .filter((r) => r.cle)
      .map((r) => [String(r.cle), String(r.valeur ?? "")]),
  );
}

// ------------------------------------------------------------------
// Historique des ventes
// ------------------------------------------------------------------

export interface VenteResume {
  id: string;
  timestamp: string;
  clientNom: string;
  total: number;
  operateurEmail: string;
  statut: string;
  nbArticles: number;
}

export async function listVentes(): Promise<VenteResume[]> {
  const [ventes, lignes] = await Promise.all([
    readTab<Record<string, unknown>>(PHARMA_SHEETS.ventes),
    readTab<Record<string, unknown>>(PHARMA_SHEETS.lignesVente),
  ]);
  const articlesParVente = new Map<string, number>();
  for (const l of lignes) {
    const vid = String(l.vente_id ?? "");
    articlesParVente.set(
      vid,
      (articlesParVente.get(vid) ?? 0) + Number(l.quantite ?? 0),
    );
  }
  return ventes
    .filter((v) => v.id)
    .map((v) => ({
      id: String(v.id),
      timestamp: String(v.timestamp ?? ""),
      clientNom: String(v.client_nom ?? ""),
      total: Number(v.total ?? 0),
      operateurEmail: String(v.operateur_email ?? ""),
      statut: String(v.statut ?? "active"),
      nbArticles: articlesParVente.get(String(v.id)) ?? 0,
    }))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// ------------------------------------------------------------------
// Fiche produit
// ------------------------------------------------------------------

/**
 * Met à jour les champs éditables d'un produit (cellules ciblées de
 * sa ligne). Le stock n'en fait jamais partie : il reste dérivé des
 * mouvements. Un seul éditeur par fiche en pratique → risque de
 * concurrence négligeable.
 */
export async function updateProduitFields(
  produitId: string,
  fields: {
    prix_achat?: number;
    prix_vente?: number;
    stock_min?: number;
    fournisseur?: string;
    emplacement?: string;
    statut?: string;
  },
): Promise<boolean> {
  const res = await getClient().spreadsheets.values.get({
    spreadsheetId: getEnv().spreadsheetId,
    range: `${PHARMA_SHEETS.produits}!A:A`,
  });
  const col = (res.data.values ?? []).flat();
  const rowIndex = col.findIndex((v) => v === produitId);
  if (rowIndex < 0) return false;
  const row = rowIndex + 1;

  // Colonnes : I prix_achat · J prix_vente · L stock_min ·
  //            M fournisseur · N emplacement · O statut
  const COLS: Record<string, string> = {
    prix_achat: "I",
    prix_vente: "J",
    stock_min: "L",
    fournisseur: "M",
    emplacement: "N",
    statut: "O",
  };
  const data = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ({
      range: `${PHARMA_SHEETS.produits}!${COLS[k]}${row}`,
      values: [[v]],
    }));
  if (data.length === 0) return true;

  await getClient().spreadsheets.values.batchUpdate({
    spreadsheetId: getEnv().spreadsheetId,
    requestBody: { valueInputOption: "RAW", data },
  });
  return true;
}

/**
 * Passe une vente au statut « annulee » (cellule G de sa ligne) —
 * seule écriture ciblée du module, un annulateur unique par vente
 * rend le risque de concurrence négligeable. La remise en stock se
 * fait par mouvements compensatoires (append) côté action.
 */
export async function marquerVenteAnnulee(venteId: string): Promise<boolean> {
  const res = await getClient().spreadsheets.values.get({
    spreadsheetId: getEnv().spreadsheetId,
    range: `${PHARMA_SHEETS.ventes}!A:A`,
  });
  const col = (res.data.values ?? []).flat();
  const rowIndex = col.findIndex((v) => v === venteId);
  if (rowIndex < 0) return false;
  await getClient().spreadsheets.values.update({
    spreadsheetId: getEnv().spreadsheetId,
    range: `${PHARMA_SHEETS.ventes}!G${rowIndex + 1}`,
    valueInputOption: "RAW",
    requestBody: { values: [["annulee"]] },
  });
  return true;
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
