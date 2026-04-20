"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { getMaterial, updateMaterial } from "@/lib/sheets/materials";
import { createMovement, classifyMovementType } from "@/lib/sheets/movements";
import { logAudit, AuditAction } from "@/lib/sheets/audit";
import type { Movement } from "@/types";

export type TransferState = {
  ok: boolean;
  error?: string;
  movement?: Movement;
};

/* ============================================================
   TRANSFERT — met à jour le matériel + crée le mouvement + audit
   ============================================================ */
export async function transferMaterialAction(
  materialId: string,
  formData: FormData,
): Promise<TransferState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };
  if (!can(userSession.user.role, "movement:create")) {
    return {
      ok: false,
      error: "Votre rôle n'autorise pas les transferts.",
    };
  }

  const current = await getMaterial(materialId);
  if (!current) return { ok: false, error: "Matériel introuvable." };

  const toSiteId = String(formData.get("toSiteId") ?? "").trim();
  const toRoomId = String(formData.get("toRoomId") ?? "").trim();
  const toAssignedToRaw = String(formData.get("toAssignedTo") ?? "").trim();
  const toAssignedTo = toAssignedToRaw === "" ? undefined : toAssignedToRaw;
  const reason = String(formData.get("reason") ?? "").trim() || undefined;

  if (!toSiteId || !toRoomId) {
    return { ok: false, error: "Site et salle de destination sont requis." };
  }

  const movementType = classifyMovementType({
    fromSiteId: current.siteId,
    fromRoomId: current.roomId,
    fromAssignedTo: current.assignedTo,
    toSiteId,
    toRoomId,
    toAssignedTo,
  });

  if (!movementType) {
    return {
      ok: false,
      error: "Aucun changement détecté (site, salle et affectation identiques).",
    };
  }

  try {
    // 1. Update du matériel
    await updateMaterial(materialId, {
      siteId: toSiteId,
      roomId: toRoomId,
      assignedTo: toAssignedTo,
    });

    // 2. Enregistrement du mouvement
    const movement = await createMovement({
      materialId,
      type: movementType,
      fromSiteId: current.siteId,
      fromRoomId: current.roomId,
      fromAssignedTo: current.assignedTo,
      toSiteId,
      toRoomId,
      toAssignedTo,
      byUserId: userSession.user.id,
      reason,
    });

    // 3. Audit
    const h = await headers();
    await logAudit({
      userId: userSession.user.id,
      userEmail: userSession.user.email ?? "",
      action: AuditAction.TransferMaterial,
      targetType: "material",
      targetId: materialId,
      details: `Transfert ${movementType}${reason ? ` — ${reason}` : ""}`,
      ip: h.get("x-forwarded-for") ?? "",
      userAgent: h.get("user-agent") ?? "",
    });

    revalidatePath(`/materials/${materialId}`);
    revalidatePath("/movements");
    revalidatePath("/dashboard");

    return { ok: true, movement };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ============================================================
   MARK CREATION — utilisé lors de la création initiale d'un matériel
   (Phase 6.1 — appelé par createMaterialAction plus tard)
   ============================================================ */
export async function recordCreationMovement(
  materialId: string,
  siteId: string,
  roomId: string,
  assignedTo: string | undefined,
  byUserId: string,
): Promise<void> {
  try {
    await createMovement({
      materialId,
      type: "creation",
      toSiteId: siteId,
      toRoomId: roomId,
      toAssignedTo: assignedTo,
      byUserId,
      reason: "Création initiale",
    });
  } catch (e) {
    console.error("[movement] failed to log creation", { materialId, error: e });
  }
}

// Wrapper utilisable directement depuis un <form> (redirect après succès)
export async function transferMaterialFormAction(formData: FormData): Promise<void> {
  const materialId = String(formData.get("materialId") ?? "");
  if (!materialId) return;

  const result = await transferMaterialAction(materialId, formData);
  if (result.ok) {
    redirect(`/materials/${materialId}`);
  }
  // En cas d'erreur, on retourne et le form client gère l'affichage
  // (cette action est surtout utile si on veut un form non-JS pur)
}
