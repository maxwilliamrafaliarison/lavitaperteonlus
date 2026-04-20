import { appendRow, SHEETS } from "./client";
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
