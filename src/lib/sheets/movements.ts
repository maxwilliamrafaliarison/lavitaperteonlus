import { appendRow, readSheet, SHEETS } from "./client";
import { MovementType } from "@/types";
import type { Movement } from "@/types";
import { str, opt, enumOr } from "./cells";

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
    id: str(row.id),
    materialId: str(row.materialId),
    // L'ancien `String(row.type) || "creation"` ne repliait jamais
    // (String(null) = "null", truthy) — voir l'en-tête de cells.ts.
    type: enumOr(row.type, MovementType, "creation"),
    fromSiteId: opt(row.fromSiteId),
    fromRoomId: opt(row.fromRoomId),
    fromAssignedTo: opt(row.fromAssignedTo),
    toSiteId: opt(row.toSiteId),
    toRoomId: opt(row.toRoomId),
    toAssignedTo: opt(row.toAssignedTo),
    byUserId: str(row.byUserId),
    reason: opt(row.reason),
    date: str(row.date),
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
