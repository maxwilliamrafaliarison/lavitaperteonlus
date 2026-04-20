import { appendRow, readSheet, SHEETS } from "./client";
import type { Movement, MovementType } from "@/types";

/* ============================================================
   COUCHE D'ACCÈS — onglet `movements` du Google Sheet
   Headers :
   id | materialId | type |
   fromSiteId | fromRoomId | fromAssignedTo |
   toSiteId | toRoomId | toAssignedTo |
   byUserId | reason | date
   ============================================================ */

type RawRow = Record<string, unknown>;

function genId(): string {
  return `mov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function rowToMovement(row: RawRow): Movement | null {
  if (!row.id || !row.materialId) return null;
  return {
    id: String(row.id),
    materialId: String(row.materialId),
    type: ((String(row.type) as MovementType) || "creation") as MovementType,
    fromSiteId: row.fromSiteId ? String(row.fromSiteId) : undefined,
    fromRoomId: row.fromRoomId ? String(row.fromRoomId) : undefined,
    fromAssignedTo: row.fromAssignedTo ? String(row.fromAssignedTo) : undefined,
    toSiteId: row.toSiteId ? String(row.toSiteId) : undefined,
    toRoomId: row.toRoomId ? String(row.toRoomId) : undefined,
    toAssignedTo: row.toAssignedTo ? String(row.toAssignedTo) : undefined,
    byUserId: String(row.byUserId ?? ""),
    reason: row.reason ? String(row.reason) : undefined,
    date: String(row.date ?? ""),
  };
}

function movementToRow(m: Movement): unknown[] {
  return [
    m.id,
    m.materialId,
    m.type,
    m.fromSiteId ?? "",
    m.fromRoomId ?? "",
    m.fromAssignedTo ?? "",
    m.toSiteId ?? "",
    m.toRoomId ?? "",
    m.toAssignedTo ?? "",
    m.byUserId,
    m.reason ?? "",
    m.date,
  ];
}

// --- Lecture --------------------------------------------------
export async function listMovements(opts?: {
  materialId?: string;
  type?: MovementType;
  limit?: number;
}): Promise<Movement[]> {
  const rows = await readSheet<RawRow>(SHEETS.movements);
  let movements = rows.map(rowToMovement).filter((m): m is Movement => m !== null);
  if (opts?.materialId) movements = movements.filter((m) => m.materialId === opts.materialId);
  if (opts?.type) movements = movements.filter((m) => m.type === opts.type);
  // Plus récent en premier
  movements.sort((a, b) => b.date.localeCompare(a.date));
  if (opts?.limit) movements = movements.slice(0, opts.limit);
  return movements;
}

// --- Écriture -------------------------------------------------
export async function createMovement(
  entry: Omit<Movement, "id" | "date"> & { date?: string },
): Promise<Movement> {
  const movement: Movement = {
    ...entry,
    id: genId(),
    date: entry.date ?? new Date().toISOString(),
  };
  await appendRow(SHEETS.movements, movementToRow(movement));
  return movement;
}

/* ============================================================
   HELPER — déduit le type de mouvement selon les champs changés
   Priorité : site > salle > utilisateur (le plus impactant).
   ============================================================ */
export function classifyMovementType(params: {
  fromSiteId?: string;
  fromRoomId?: string;
  fromAssignedTo?: string;
  toSiteId?: string;
  toRoomId?: string;
  toAssignedTo?: string;
}): MovementType | null {
  const siteChanged =
    params.toSiteId !== undefined && params.toSiteId !== params.fromSiteId;
  const roomChanged =
    params.toRoomId !== undefined && params.toRoomId !== params.fromRoomId;
  const userChanged = params.toAssignedTo !== params.fromAssignedTo;

  if (siteChanged) return "transfert_site";
  if (roomChanged) return "transfert_salle";
  if (userChanged) return "transfert_utilisateur";
  return null;
}
