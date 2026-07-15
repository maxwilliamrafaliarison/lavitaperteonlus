import { appendRow, readSheet, SHEETS, updateRow, deleteRow, getSheetsClient, getSpreadsheetId } from "./client";
import { MaterialState, MaterialType } from "@/types";
import type { Material } from "@/types";
import { str, opt, bool, num, list, enumOr } from "./cells";

/* ============================================================
   COUCHE D'ACCÈS — onglet `materials` du Google Sheet
   Headers : (cf. setupSheet)
   id | ref | type | designation | brand | model | serialNumber |
   siteId | roomId | service | owner | assignedTo |
   purchaseDate | purchasePrice | amortization |
   os | cpu | ram | storage |
   ipAddress | macAddress | internetAccess | linkedToBDD |
   state | notes | photos |
   quantity2023 | quantity2024 | quantity2025 |
   createdAt | updatedAt | deletedAt
   ============================================================ */

type RawRow = Record<string, unknown>;

function rowToMaterial(row: RawRow): Material | null {
  if (!row.id || !row.ref) return null;
  return {
    id: str(row.id),
    ref: str(row.ref),
    // enumOr : une valeur vide OU inconnue retombe sur le repli. L'ancien
    // `String(row.type) || "autre"` ne repliait jamais (String(null) = "null",
    // truthy) — voir l'en-tête de cells.ts.
    type: enumOr(row.type, MaterialType, "autre"),
    designation: str(row.designation),
    brand: opt(row.brand),
    model: opt(row.model),
    serialNumber: opt(row.serialNumber),
    siteId: str(row.siteId),
    roomId: str(row.roomId),
    service: opt(row.service),
    owner: opt(row.owner),
    assignedTo: opt(row.assignedTo),
    purchaseDate: opt(row.purchaseDate),
    purchasePrice: num(row.purchasePrice),
    amortization: opt(row.amortization),
    os: opt(row.os),
    cpu: opt(row.cpu),
    ram: opt(row.ram),
    storage: opt(row.storage),
    ipAddress: opt(row.ipAddress),
    macAddress: opt(row.macAddress),
    internetAccess: bool(row.internetAccess),
    linkedToBDD: bool(row.linkedToBDD),
    state: enumOr(row.state, MaterialState, "operationnel"),
    notes: opt(row.notes),
    photos: list(row.photos),
    quantity2023: num(row.quantity2023),
    quantity2024: num(row.quantity2024),
    quantity2025: num(row.quantity2025),
    createdAt: str(row.createdAt),
    updatedAt: str(row.updatedAt),
    deletedAt: opt(row.deletedAt),
    biosDate: opt(row.biosDate),
  };
}

function materialToRow(m: Material): unknown[] {
  return [
    m.id, m.ref, m.type, m.designation,
    m.brand ?? "", m.model ?? "", m.serialNumber ?? "",
    m.siteId, m.roomId, m.service ?? "",
    m.owner ?? "", m.assignedTo ?? "",
    m.purchaseDate ?? "", m.purchasePrice ?? "", m.amortization ?? "",
    m.os ?? "", m.cpu ?? "", m.ram ?? "", m.storage ?? "",
    m.ipAddress ?? "", m.macAddress ?? "",
    m.internetAccess === undefined ? "" : m.internetAccess ? "TRUE" : "FALSE",
    m.linkedToBDD === undefined ? "" : m.linkedToBDD ? "TRUE" : "FALSE",
    m.state, m.notes ?? "",
    m.photos.join(","),
    m.quantity2023 ?? "", m.quantity2024 ?? "", m.quantity2025 ?? "",
    m.createdAt, m.updatedAt, m.deletedAt ?? "",
    m.biosDate ?? "",
  ];
}

// --- Lecture --------------------------------------------------
export async function listMaterials(opts?: {
  siteId?: string;
  roomId?: string;
  type?: MaterialType;
  includeDeleted?: boolean;
}): Promise<Material[]> {
  const rows = await readSheet<RawRow>(SHEETS.materials);
  let materials = rows.map(rowToMaterial).filter((m): m is Material => m !== null);
  if (!opts?.includeDeleted) {
    materials = materials.filter((m) => !m.deletedAt);
  }
  if (opts?.siteId) materials = materials.filter((m) => m.siteId === opts.siteId);
  if (opts?.roomId) materials = materials.filter((m) => m.roomId === opts.roomId);
  if (opts?.type) materials = materials.filter((m) => m.type === opts.type);
  return materials;
}

export async function getMaterial(id: string): Promise<Material | null> {
  const list = await listMaterials({ includeDeleted: true });
  return list.find((m) => m.id === id) ?? null;
}

// --- Écriture -------------------------------------------------
export async function createMaterial(material: Material): Promise<Material> {
  await appendRow(SHEETS.materials, materialToRow(material));
  return material;
}

export async function updateMaterial(id: string, patch: Partial<Material>): Promise<Material> {
  const client = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const res = await client.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEETS.materials}!A:A`,
  });
  const ids = (res.data.values ?? []).flat() as string[];
  const idx = ids.indexOf(id);
  if (idx <= 0) throw new Error(`Matériel ${id} introuvable`);
  const rowIndex = idx + 1;

  const current = await getMaterial(id);
  if (!current) throw new Error(`Matériel ${id} introuvable (re-fetch)`);
  const merged: Material = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await updateRow(SHEETS.materials, rowIndex, materialToRow(merged));
  return merged;
}

export async function softDeleteMaterial(id: string): Promise<Material> {
  return updateMaterial(id, { deletedAt: new Date().toISOString() });
}

export async function restoreMaterial(id: string): Promise<Material> {
  return updateMaterial(id, { deletedAt: undefined });
}

/**
 * Supprime définitivement la ligne du matériel (non réversible).
 * Les sessions et mouvements associés restent par design (traçabilité).
 */
export async function hardDeleteMaterial(id: string): Promise<void> {
  const client = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const res = await client.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEETS.materials}!A:A`,
  });
  const ids = (res.data.values ?? []).flat() as string[];
  const idx = ids.indexOf(id);
  if (idx <= 0) throw new Error(`Matériel ${id} introuvable`);
  await deleteRow(SHEETS.materials, idx + 1);
}
