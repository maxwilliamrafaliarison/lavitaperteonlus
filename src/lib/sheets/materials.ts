import { appendRow, readSheet, SHEETS, updateRow, deleteRow, getSheetsClient, getSpreadsheetId } from "./client";
import type { Material, MaterialState, MaterialType } from "@/types";

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

function toBool(v: unknown): boolean | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "boolean") return v;
  const s = String(v).toUpperCase();
  if (s === "TRUE" || s === "OUI" || s === "YES" || s === "1") return true;
  if (s === "FALSE" || s === "NON" || s === "NO" || s === "0") return false;
  return undefined;
}

function toNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function rowToMaterial(row: RawRow): Material | null {
  if (!row.id || !row.ref) return null;
  return {
    id: String(row.id),
    ref: String(row.ref),
    type: (String(row.type) as MaterialType) || "autre",
    designation: String(row.designation ?? ""),
    brand: row.brand ? String(row.brand) : undefined,
    model: row.model ? String(row.model) : undefined,
    serialNumber: row.serialNumber ? String(row.serialNumber) : undefined,
    siteId: String(row.siteId ?? ""),
    roomId: String(row.roomId ?? ""),
    service: row.service ? String(row.service) : undefined,
    owner: row.owner ? String(row.owner) : undefined,
    assignedTo: row.assignedTo ? String(row.assignedTo) : undefined,
    purchaseDate: row.purchaseDate ? String(row.purchaseDate) : undefined,
    purchasePrice: toNum(row.purchasePrice),
    amortization: row.amortization ? String(row.amortization) : undefined,
    os: row.os ? String(row.os) : undefined,
    cpu: row.cpu ? String(row.cpu) : undefined,
    ram: row.ram ? String(row.ram) : undefined,
    storage: row.storage ? String(row.storage) : undefined,
    ipAddress: row.ipAddress ? String(row.ipAddress) : undefined,
    macAddress: row.macAddress ? String(row.macAddress) : undefined,
    internetAccess: toBool(row.internetAccess),
    linkedToBDD: toBool(row.linkedToBDD),
    state: ((String(row.state) as MaterialState) || "operationnel") as MaterialState,
    notes: row.notes ? String(row.notes) : undefined,
    photos: row.photos
      ? String(row.photos).split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    quantity2023: toNum(row.quantity2023),
    quantity2024: toNum(row.quantity2024),
    quantity2025: toNum(row.quantity2025),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
    deletedAt: row.deletedAt ? String(row.deletedAt) : undefined,
    biosDate: row.biosDate ? String(row.biosDate) : undefined,
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
