import { google, sheets_v4 } from "googleapis";

import {
  Produit,
  Lot,
  Mouvement,
  EntitePec,
  type ProduitAvecStock,
  type StockLot,
} from "./types";
import { sbSelect, sbInsert, sbUpdate, sbRpc } from "@/lib/supabase-server";

/* ============================================================
   PHARMACIE — Accès données, à deux backends
   - "sheets"   : Google Sheets (historique, défaut)
   - "supabase" : Postgres unique du centre (schéma `pharmacie`)
   Sélection par PHARMACIE_BACKEND (défaut "sheets"). La bascule est
   réversible en une variable d'environnement, sans redéploiement du
   code. Le nom du fichier est conservé pour ne pas casser les imports.

   Architecture append-only inchangée : le stock reste la somme des
   mouvements (jamais une valeur stockée).
   ============================================================ */

function backend(): "sheets" | "supabase" {
  return process.env.PHARMACIE_BACKEND === "supabase" ? "supabase" : "sheets";
}

const SCHEMA = "pharmacie";

export const PHARMA_SHEETS = {
  produits: "produits",
  lots: "lots",
  mouvements: "mouvements",
  ventes: "ventes",
  lignesVente: "lignes_vente",
  fournisseurs: "fournisseurs",
  parametres: "parametres",
  achats: "achats",
  achatsLignes: "achats_lignes",
  entitesPec: "entites_pec",
} as const;
export type PharmaSheetName = (typeof PHARMA_SHEETS)[keyof typeof PHARMA_SHEETS];

/** Ordre des colonnes par table (les appelants passent des tableaux positionnels). */
const COLUMN_ORDER: Record<PharmaSheetName, string[]> = {
  // ⚠ AJOUT EN FIN DE LISTE UNIQUEMENT, jamais d'insertion : les lignes sont
  // écrites par POSITION (appendRowsSheets envoie un tableau brut) et
  // updateProduitFieldsSheets mappe les colonnes par lettre en dur. Insérer
  // une colonne décalerait tout, sans la moindre erreur.
  produits: ["id", "code", "designation", "dci", "classe", "forme", "dosage", "conditionnement", "prix_achat", "prix_vente", "prix_unitaire", "stock_min", "fournisseur", "emplacement", "statut", "createdAt", "facteur_conversion", "unite_detail", "prix_vente_detail"],
  mouvements: ["id", "timestamp", "produit_id", "lot_id", "type", "quantite", "prix_unitaire", "reference", "user_email", "note", "unite_saisie", "facteur_applique", "compartiment"],
  ventes: ["id", "timestamp", "client_nom", "type_vente", "total", "operateur_email", "statut", "pec_payeur", "valeur_pec"],
  lignes_vente: ["id", "vente_id", "produit_id", "lot_id", "quantite", "prix_unitaire", "sous_total", "mode_vente", "qte_stock_deduire"],
  lots: ["id", "produit_id", "numero_lot", "date_expiration", "date_reception", "contenance"],
  fournisseurs: ["id", "nom", "telephone", "email", "adresse"],
  parametres: ["cle", "valeur"],
  achats: ["id", "timestamp", "date_facture", "fournisseur", "num_facture", "num_bl", "montant_total", "operateur_email", "statut", "note"],
  achats_lignes: ["id", "achat_id", "produit_id", "designation", "contenance", "quantite", "date_expiration", "numero_lot", "montant"],
  entites_pec: ["id", "nom", "actif"],
};

const NUMERIC_COLS: Record<PharmaSheetName, Set<string>> = {
  produits: new Set(["prix_achat", "prix_vente", "prix_unitaire", "stock_min", "facteur_conversion", "prix_vente_detail"]),
  mouvements: new Set(["quantite", "prix_unitaire", "facteur_applique"]),
  ventes: new Set(["total", "valeur_pec"]),
  lignes_vente: new Set(["quantite", "prix_unitaire", "sous_total", "qte_stock_deduire"]),
  lots: new Set(),
  fournisseurs: new Set(),
  parametres: new Set(),
  achats: new Set(["montant_total"]),
  achats_lignes: new Set(["quantite", "montant"]),
  entites_pec: new Set(),
};

// ==================================================================
// Backend GOOGLE SHEETS
// ==================================================================

let _client: sheets_v4.Sheets | null = null;

function sheetsEnv() {
  const spreadsheetId = process.env.PHARMACIE_SHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!spreadsheetId || !clientEmail || !rawKey) {
    throw new Error("Pharmacie (Sheets) non configurée : PHARMACIE_SHEET_ID + credentials.");
  }
  return { spreadsheetId, clientEmail, privateKey: rawKey.replace(/\\n/g, "\n") };
}

function sheetsClient(): sheets_v4.Sheets {
  if (_client) return _client;
  const { clientEmail, privateKey } = sheetsEnv();
  const auth = new google.auth.JWT({
    email: clientEmail, key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  _client = google.sheets({ version: "v4", auth });
  return _client;
}

async function readTabSheets<T extends Record<string, unknown>>(tab: PharmaSheetName): Promise<T[]> {
  const res = await sheetsClient().spreadsheets.values.get({
    spreadsheetId: sheetsEnv().spreadsheetId,
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
      headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
      return obj as T;
    });
}

async function appendRowsSheets(tab: PharmaSheetName, values: unknown[][]): Promise<void> {
  await sheetsClient().spreadsheets.values.append({
    spreadsheetId: sheetsEnv().spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

async function updateProduitFieldsSheets(
  produitId: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  const res = await sheetsClient().spreadsheets.values.get({
    spreadsheetId: sheetsEnv().spreadsheetId,
    range: `${PHARMA_SHEETS.produits}!A:A`,
  });
  const col = (res.data.values ?? []).flat();
  const rowIndex = col.findIndex((v) => v === produitId);
  if (rowIndex < 0) return false;
  const row = rowIndex + 1;
  // Lettres de colonnes du Sheet. Doit suivre COLUMN_ORDER.produits :
  // A=id … P=createdAt, puis les colonnes du fractionnement.
  const COLS: Record<string, string> = {
    prix_achat: "I", prix_vente: "J", stock_min: "L",
    fournisseur: "M", emplacement: "N", statut: "O",
    facteur_conversion: "Q", unite_detail: "R", prix_vente_detail: "S",
  };
  const data = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ({ range: `${PHARMA_SHEETS.produits}!${COLS[k]}${row}`, values: [[v]] }));
  if (data.length === 0) return true;
  await sheetsClient().spreadsheets.values.batchUpdate({
    spreadsheetId: sheetsEnv().spreadsheetId,
    requestBody: { valueInputOption: "RAW", data },
  });
  return true;
}

async function marquerVenteAnnuleeSheets(venteId: string): Promise<boolean> {
  const res = await sheetsClient().spreadsheets.values.get({
    spreadsheetId: sheetsEnv().spreadsheetId,
    range: `${PHARMA_SHEETS.ventes}!A:A`,
  });
  const col = (res.data.values ?? []).flat();
  const rowIndex = col.findIndex((v) => v === venteId);
  if (rowIndex < 0) return false;
  await sheetsClient().spreadsheets.values.update({
    spreadsheetId: sheetsEnv().spreadsheetId,
    range: `${PHARMA_SHEETS.ventes}!G${rowIndex + 1}`,
    valueInputOption: "RAW",
    requestBody: { values: [["annulee"]] },
  });
  return true;
}

// ==================================================================
// Backend SUPABASE (schéma pharmacie)
// ==================================================================

async function readTabSupabase<T extends Record<string, unknown>>(tab: PharmaSheetName): Promise<T[]> {
  const all: T[] = [];
  const page = 1000;
  // Clé de tri de chaque table. `parametres` n'a pas d'`id` : sa clé est `cle`.
  const cle = tab === PHARMA_SHEETS.parametres ? "cle" : "id";
  for (let offset = 0; ; offset += page) {
    // `order` EXPLICITE, jamais optionnel : un LIMIT/OFFSET sans ORDER BY
    // n'a aucun ordre garanti en Postgres. Au-delà de la première page, des
    // lignes seraient dupliquées ou omises — et comme le stock EST la somme
    // des mouvements, une dérive silencieuse et indatable s'installerait sur
    // un médicament au hasard. La table grossit à chaque ligne de chaque
    // vente : le seuil des 1000 tombera de lui-même.
    const { rows } = await sbSelect<T>(SCHEMA, tab, {
      select: "*",
      order: `${cle}.asc`,
      limit: page,
      offset,
    });
    all.push(...rows);
    if (rows.length < page) break;
  }
  return all;
}

async function appendRowsSupabase(tab: PharmaSheetName, values: unknown[][]): Promise<void> {
  const order = COLUMN_ORDER[tab];
  const nums = NUMERIC_COLS[tab];
  const rows = values.map((arr) => {
    const obj: Record<string, unknown> = {};
    order.forEach((colName, i) => {
      const raw = arr[i];
      // Valeur absente du tableau (appelant écrit avant l'ajout de la
      // colonne) : on omet la clé pour laisser jouer le DEFAULT de la base.
      // Envoyer null ferait échouer les colonnes NOT NULL (facteur_conversion
      // vaut 1 par défaut, pas 0 : une valeur imposée serait fausse).
      // Côté Sheets, un tableau court laisse la cellule vide et le lecteur
      // applique le même défaut — les deux backends restent alignés.
      if (raw === undefined) return;
      if (nums.has(colName)) {
        // Colonne numérique : une valeur vide n'est pas 0, c'est « non
        // renseigné » → null (ces colonnes-là sont nullables en base).
        if (raw === "" || raw === null) {
          obj[colName] = null;
        } else {
          const n = Number(raw);
          obj[colName] = Number.isFinite(n) ? n : null;
        }
        return;
      }
      // Colonne TEXTE : le vide s'écrit "" et JAMAIS null. La migration 004
      // les a passées NOT NULL, donc un null y déclenche une erreur 23502 —
      // ce qui faisait échouer toute création de produit sans DCI et TOUTE
      // vente (les mouvements sans lot écrivaient lot_id = null).
      // "" et null sont de toute façon équivalents ici, et le lecteur txt()
      // absorbe les deux.
      obj[colName] = raw === null ? "" : raw;
    });
    return obj;
  });
  await sbInsert(SCHEMA, tab, rows);
}

async function updateProduitFieldsSupabase(
  produitId: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) patch[k] = v;
  if (Object.keys(patch).length === 0) return true;
  const n = await sbUpdate(SCHEMA, PHARMA_SHEETS.produits, { id: `eq.${produitId}` }, patch);
  return n > 0;
}

async function marquerVenteAnnuleeSupabase(venteId: string): Promise<boolean> {
  const n = await sbUpdate(SCHEMA, PHARMA_SHEETS.ventes, { id: `eq.${venteId}` }, { statut: "annulee" });
  return n > 0;
}

// ==================================================================
// Primitives dispatchées selon le backend
// ==================================================================

async function readTab<T extends Record<string, unknown>>(tab: PharmaSheetName): Promise<T[]> {
  return backend() === "supabase" ? readTabSupabase<T>(tab) : readTabSheets<T>(tab);
}

/** Insère des lignes (append-only). Format positionnel (ordre COLUMN_ORDER). */
export async function appendRows(tab: PharmaSheetName, values: unknown[][]): Promise<void> {
  return backend() === "supabase" ? appendRowsSupabase(tab, values) : appendRowsSheets(tab, values);
}

/**
 * Enregistre une vente complète : entête + lignes + mouvements négatifs.
 * Les mouvements en DERNIER pour que le stock ne décrémente qu'une fois
 * la vente réellement tracée.
 */
/** Tableau positionnel → objet nommé, selon COLUMN_ORDER de l'onglet. */
function versObjet(tab: PharmaSheetName, values: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  COLUMN_ORDER[tab].forEach((col, i) => {
    if (values[i] !== undefined) obj[col] = values[i];
  });
  return obj;
}

/**
 * Enregistre une vente : l'en-tête, ses lignes et les mouvements de stock.
 *
 * Sur SUPABASE, les trois écritures passent par une fonction Postgres, donc
 * tombent ENSEMBLE ou pas du tout. C'est indispensable : en trois appels
 * séparés, un échec du dernier laissait la vente et son ticket en base sans
 * jamais décrémenter le stock. Le pharmacien refaisait la vente, et la
 * première restait — comptée dans le chiffre d'affaires. La caisse et le
 * stock divergeaient en silence.
 *
 * La fonction est idempotente : renvoyer deux fois le même identifiant de
 * vente n'écrit qu'une fois. Un double clic ou un renvoi de formulaire ne
 * duplique donc pas la recette.
 *
 * Sur SHEETS, l'atomicité est hors de portée (l'API n'a pas de
 * transaction) : on conserve les trois appels, dans l'ordre le moins
 * dommageable — le stock EN PREMIER. Si la suite échoue, le stock est
 * décrémenté sans vente : visible à l'inventaire, et sans effet sur la
 * caisse. L'inverse — une vente encaissée sans sortie de stock — serait
 * bien pire.
 */
export async function enregistrerVente(input: {
  venteRow: unknown[];
  lignesRows: unknown[][];
  mouvementsRows: unknown[][];
}): Promise<void> {
  if (backend() === "supabase") {
    await sbRpc<string>(SCHEMA, "enregistrer_vente", {
      p_vente: versObjet(PHARMA_SHEETS.ventes, input.venteRow),
      p_lignes: input.lignesRows.map((r) => versObjet(PHARMA_SHEETS.lignesVente, r)),
      p_mouvements: input.mouvementsRows.map((r) => versObjet(PHARMA_SHEETS.mouvements, r)),
    });
    return;
  }
  await appendRows(PHARMA_SHEETS.mouvements, input.mouvementsRows);
  await appendRows(PHARMA_SHEETS.ventes, [input.venteRow]);
  await appendRows(PHARMA_SHEETS.lignesVente, input.lignesRows);
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

/** Paramètres clé/valeur de la table parametres. */
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
 * Met à jour les champs éditables d'un produit. Le stock n'en fait
 * jamais partie : il reste dérivé des mouvements.
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
    // Fractionnement. `facteur_conversion` DÉFINIT l'unité du stock : son
    // seul appelant légitime est definirFractionnementAction, qui porte la
    // conversion du stock existant. Ne jamais l'exposer dans un formulaire
    // d'édition générique — le changer sans convertir fausserait tout
    // l'historique d'un coup.
    facteur_conversion?: number;
    unite_detail?: string;
    prix_vente_detail?: number;
  },
): Promise<boolean> {
  return backend() === "supabase"
    ? updateProduitFieldsSupabase(produitId, fields)
    : updateProduitFieldsSheets(produitId, fields);
}

/**
 * Passe une vente au statut « annulee ». La remise en stock se fait par
 * mouvements compensatoires (append) côté action.
 */
export async function marquerVenteAnnulee(venteId: string): Promise<boolean> {
  return backend() === "supabase"
    ? marquerVenteAnnuleeSupabase(venteId)
    : marquerVenteAnnuleeSheets(venteId);
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
      // Somme des quantités signées des mouvements, donc TOUJOURS en unités
      // de base — la même unité que celle dans laquelle elles ont été écrites.
      stockBase: stockParProduit.get(p.id) ?? 0,
      prochainePeremption,
      joursAvantPeremption: prochainePeremption
        ? daysUntil(prochainePeremption)
        : null,
    };
  });
}

/**
 * Stock ventilé par lot ET compartiment (migration 009), pour l'allocation
 * FEFO. Retourne, par produit, la liste de ses lots avec leurs quantités
 * GROS et DÉTAIL — toutes en unités de base, toutes issues de la somme des
 * mouvements (jamais d'une cellule stockée).
 *
 * Les mouvements sans lot_id (historique d'avant les lots) sont rangés sous
 * la clé "" : le backfill (migration 011) les rattachera à un vrai lot.
 */
export async function listStockParLot(): Promise<Map<string, StockLot[]>> {
  const [mouvements, lots] = await Promise.all([listMouvements(), listLots()]);

  // Péremption et numéro par lot, pour enrichir l'affichage FEFO.
  const infoLot = new Map(lots.map((l) => [l.id, l]));

  // Accumulateur : produit → lot → { gros, detail }.
  const parProduit = new Map<string, Map<string, { gros: number; detail: number }>>();
  for (const m of mouvements) {
    if (!parProduit.has(m.produit_id)) parProduit.set(m.produit_id, new Map());
    const parLot = parProduit.get(m.produit_id)!;
    if (!parLot.has(m.lot_id)) parLot.set(m.lot_id, { gros: 0, detail: 0 });
    const bucket = parLot.get(m.lot_id)!;
    if (m.compartiment === "detail") bucket.detail += m.quantite;
    else bucket.gros += m.quantite;
  }

  const out = new Map<string, StockLot[]>();
  for (const [produitId, parLot] of parProduit) {
    const lignes: StockLot[] = [];
    for (const [lotId, { gros, detail }] of parLot) {
      const info = infoLot.get(lotId);
      lignes.push({
        lotId,
        numeroLot: info?.numero_lot ?? "",
        dateExpiration: info?.date_expiration ?? "",
        gros,
        detail,
      });
    }
    out.set(produitId, lignes);
  }
  return out;
}

/** Mouvements d'une vente donnée (pour l'annulation miroir lot par lot). */
export async function listMouvementsDeVente(venteId: string): Promise<Mouvement[]> {
  const rows = await listMouvements();
  return rows.filter((m) => m.reference === venteId);
}

/** Entités de prise en charge actives (liste suggérée au comptoir). */
export async function listEntitesPec(): Promise<EntitePec[]> {
  const rows = await readTab(PHARMA_SHEETS.entitesPec);
  return rows
    .map((r) => EntitePec.safeParse(r))
    .filter((p) => p.success)
    .map((p) => p.data)
    .filter((e) => e.actif);
}

/**
 * Écrit un paramètre (upsert). Sur Supabase via la RPC set_parametre ; sur
 * Sheets, on met à jour la ligne existante ou on l'ajoute. Sert à l'option
 * TVA réservée admin (tranche T7) — aucun chemin d'écriture n'existait.
 */
export async function setParametre(cle: string, valeur: string): Promise<void> {
  if (backend() === "supabase") {
    await sbRpc(SCHEMA, "set_parametre", { p_cle: cle, p_valeur: valeur });
    return;
  }
  // Sheets (filet de secours) : mettre à jour la ligne existante, sinon l'ajouter.
  // idx+2 : ligne 1 = en-têtes, donc la donnée d'index 0 est en ligne 2.
  const rows = await readTabSheets<{ cle: unknown }>(PHARMA_SHEETS.parametres);
  const idx = rows.findIndex((r) => String(r.cle) === cle);
  if (idx >= 0) {
    await sheetsClient().spreadsheets.values.update({
      spreadsheetId: sheetsEnv().spreadsheetId,
      range: `${PHARMA_SHEETS.parametres}!A${idx + 2}`,
      valueInputOption: "RAW",
      requestBody: { values: [[cle, valeur]] },
    });
  } else {
    await appendRowsSheets(PHARMA_SHEETS.parametres, [[cle, valeur]]);
  }
}
