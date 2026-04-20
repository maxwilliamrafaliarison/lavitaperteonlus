"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  getSession as getSheetSession,
  createSession,
  updateSession,
  deleteSession,
  decryptSessionPassword,
} from "@/lib/sheets/sessions";
import { logAudit, AuditAction } from "@/lib/sheets/audit";
import type { MaterialSession } from "@/types";

export type SessionActionState = {
  ok: boolean;
  error?: string;
  session?: MaterialSession;
  password?: string;
};

/* ============================================================
   REVEAL — déchiffre + audit log
   ============================================================ */
export async function revealPasswordAction(sessionId: string): Promise<SessionActionState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };
  if (!can(userSession.user.role, "password:reveal")) {
    return { ok: false, error: "Votre rôle n'autorise pas l'accès aux mots de passe." };
  }

  const sheetSession = await getSheetSession(sessionId);
  if (!sheetSession) return { ok: false, error: "Session introuvable." };

  let plain: string;
  try {
    plain = decryptSessionPassword(sheetSession);
  } catch (e) {
    return {
      ok: false,
      error: "Échec du déchiffrement (clé ENCRYPTION_SECRET incorrecte ?). " + String(e),
    };
  }

  // Audit log
  const h = await headers();
  await logAudit({
    userId: userSession.user.id,
    userEmail: userSession.user.email ?? "",
    action: AuditAction.ViewPassword,
    targetType: "session",
    targetId: sessionId,
    details: `materialId=${sheetSession.materialId} session=${sheetSession.sessionName}`,
    ip: h.get("x-forwarded-for") ?? "",
    userAgent: h.get("user-agent") ?? "",
  });

  return { ok: true, password: plain };
}

/* ============================================================
   CREATE
   ============================================================ */
export async function createSessionAction(formData: FormData): Promise<SessionActionState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };
  if (!can(userSession.user.role, "material:update")) {
    return { ok: false, error: "Votre rôle n'autorise pas la création de sessions." };
  }

  const materialId = String(formData.get("materialId") ?? "");
  const sessionName = String(formData.get("sessionName") ?? "").trim();
  const plainPassword = String(formData.get("plainPassword") ?? "");
  const assignedUser = String(formData.get("assignedUser") ?? "").trim() || undefined;
  const isAdmin = formData.get("isAdmin") === "on";
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  if (!materialId || !sessionName || !plainPassword) {
    return { ok: false, error: "materialId, nom de session et mot de passe sont requis." };
  }

  try {
    const session = await createSession({
      materialId,
      sessionName,
      plainPassword,
      assignedUser,
      isAdmin,
      notes,
    });

    const h = await headers();
    await logAudit({
      userId: userSession.user.id,
      userEmail: userSession.user.email ?? "",
      action: AuditAction.EditMaterial,
      targetType: "session",
      targetId: session.id,
      details: `Création session "${sessionName}" sur materialId=${materialId}`,
      ip: h.get("x-forwarded-for") ?? "",
      userAgent: h.get("user-agent") ?? "",
    });

    revalidatePath(`/materials/${materialId}`);
    return { ok: true, session };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ============================================================
   UPDATE
   ============================================================ */
export async function updateSessionAction(
  sessionId: string,
  formData: FormData,
): Promise<SessionActionState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };
  if (!can(userSession.user.role, "material:update")) {
    return { ok: false, error: "Votre rôle n'autorise pas la modification." };
  }

  const sessionName = String(formData.get("sessionName") ?? "").trim();
  const plainPassword = String(formData.get("plainPassword") ?? "");
  const assignedUser = String(formData.get("assignedUser") ?? "").trim();
  const isAdmin = formData.get("isAdmin") === "on";
  const notes = String(formData.get("notes") ?? "").trim();

  try {
    const session = await updateSession(sessionId, {
      sessionName: sessionName || undefined,
      plainPassword: plainPassword || undefined,
      assignedUser: assignedUser || undefined,
      isAdmin,
      notes: notes || undefined,
    });

    const h = await headers();
    await logAudit({
      userId: userSession.user.id,
      userEmail: userSession.user.email ?? "",
      action: AuditAction.EditMaterial,
      targetType: "session",
      targetId: sessionId,
      details: `Modification session ${plainPassword ? "(MDP changé)" : "(sans changement MDP)"}`,
      ip: h.get("x-forwarded-for") ?? "",
      userAgent: h.get("user-agent") ?? "",
    });

    revalidatePath(`/materials/${session.materialId}`);
    return { ok: true, session };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ============================================================
   DELETE
   ============================================================ */
export async function deleteSessionAction(sessionId: string): Promise<SessionActionState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };
  if (!can(userSession.user.role, "material:delete")) {
    return { ok: false, error: "Votre rôle n'autorise pas la suppression." };
  }

  try {
    const sheetSession = await getSheetSession(sessionId);
    if (!sheetSession) return { ok: false, error: "Session déjà supprimée." };

    await deleteSession(sessionId);

    const h = await headers();
    await logAudit({
      userId: userSession.user.id,
      userEmail: userSession.user.email ?? "",
      action: AuditAction.DeleteMaterial,
      targetType: "session",
      targetId: sessionId,
      details: `Suppression session "${sheetSession.sessionName}" sur materialId=${sheetSession.materialId}`,
      ip: h.get("x-forwarded-for") ?? "",
      userAgent: h.get("user-agent") ?? "",
    });

    revalidatePath(`/materials/${sheetSession.materialId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
