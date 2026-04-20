import { appendRow, readSheet, SHEETS } from "./client";
import type { AuditLog, AuditLogAction } from "@/types";

/* ============================================================
   AUDIT LOG — append-only dans l'onglet `audit_log`
   Headers : id | userId | userEmail | action | targetType |
             targetId | details | ip | userAgent | timestamp
   ============================================================ */

function genId(): string {
  return `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function logAudit(entry: Omit<AuditLog, "id" | "timestamp">): Promise<void> {
  const log: AuditLog = {
    ...entry,
    id: genId(),
    timestamp: new Date().toISOString(),
  };
  // Best-effort : on n'échoue pas l'opération métier si l'audit échoue
  try {
    await appendRow(SHEETS.auditLog, [
      log.id,
      log.userId,
      log.userEmail,
      log.action,
      log.targetType,
      log.targetId,
      log.details ?? "",
      log.ip ?? "",
      log.userAgent ?? "",
      log.timestamp,
    ]);
  } catch (e) {
    console.error("[audit] failed to log entry", { action: log.action, error: e });
  }
}

// --- Lecture (admin only) -----------------------------------
type RawRow = Record<string, unknown>;

function rowToAudit(r: RawRow): AuditLog | null {
  if (!r.id) return null;
  return {
    id: String(r.id),
    userId: String(r.userId ?? ""),
    userEmail: String(r.userEmail ?? ""),
    action: (String(r.action) as AuditLogAction) ?? "view_material",
    targetType: String(r.targetType ?? ""),
    targetId: String(r.targetId ?? ""),
    details: r.details ? String(r.details) : undefined,
    ip: r.ip ? String(r.ip) : undefined,
    userAgent: r.userAgent ? String(r.userAgent) : undefined,
    timestamp: String(r.timestamp ?? ""),
  };
}

export async function listAuditLogs(opts?: {
  action?: AuditLogAction;
  userId?: string;
  limit?: number;
}): Promise<AuditLog[]> {
  const rows = await readSheet<RawRow>(SHEETS.auditLog);
  let logs = rows.map(rowToAudit).filter((l): l is AuditLog => l !== null);
  if (opts?.action) logs = logs.filter((l) => l.action === opts.action);
  if (opts?.userId) logs = logs.filter((l) => l.userId === opts.userId);
  // Plus récent en premier
  logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (opts?.limit) logs = logs.slice(0, opts.limit);
  return logs;
}

export const AuditAction = {
  Login: "login" as AuditLogAction,
  Logout: "logout" as AuditLogAction,
  ViewPassword: "view_password" as AuditLogAction,
  ViewMaterial: "view_material" as AuditLogAction,
  EditMaterial: "edit_material" as AuditLogAction,
  DeleteMaterial: "delete_material" as AuditLogAction,
  RestoreMaterial: "restore_material" as AuditLogAction,
  InviteUser: "invite_user" as AuditLogAction,
};
