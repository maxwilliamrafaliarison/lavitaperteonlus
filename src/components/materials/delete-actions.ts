"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  getMaterial,
  softDeleteMaterial,
  restoreMaterial,
  hardDeleteMaterial,
} from "@/lib/sheets/materials";
import { logAudit, AuditAction } from "@/lib/sheets/audit";

export type DeleteState = {
  ok: boolean;
  error?: string;
};

/* ============================================================
   SOFT DELETE — met le matériel en corbeille
   ============================================================ */
export async function softDeleteMaterialAction(
  materialId: string,
): Promise<DeleteState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };
  if (!can(userSession.user.role, "material:delete")) {
    return { ok: false, error: "Votre rôle n'autorise pas la suppression." };
  }

  const material = await getMaterial(materialId);
  if (!material) return { ok: false, error: "Matériel introuvable." };
  if (material.deletedAt) {
    return { ok: false, error: "Déjà dans la corbeille." };
  }

  try {
    await softDeleteMaterial(materialId);

    const h = await headers();
    await logAudit({
      userId: userSession.user.id,
      userEmail: userSession.user.email ?? "",
      action: AuditAction.DeleteMaterial,
      targetType: "material",
      targetId: materialId,
      details: `Mise en corbeille : ${material.designation || material.ref}`,
      ip: h.get("x-forwarded-for") ?? "",
      userAgent: h.get("user-agent") ?? "",
    });

    revalidatePath("/materials");
    revalidatePath("/trash");
    revalidatePath("/dashboard");
    revalidatePath(`/materials/${materialId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ============================================================
   RESTORE — sort de la corbeille
   ============================================================ */
export async function restoreMaterialAction(
  materialId: string,
): Promise<DeleteState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };
  if (!can(userSession.user.role, "material:restore")) {
    return { ok: false, error: "Seul un administrateur peut restaurer." };
  }

  const material = await getMaterial(materialId);
  if (!material) return { ok: false, error: "Matériel introuvable." };
  if (!material.deletedAt) {
    return { ok: false, error: "Ce matériel n'est pas dans la corbeille." };
  }

  try {
    await restoreMaterial(materialId);

    const h = await headers();
    await logAudit({
      userId: userSession.user.id,
      userEmail: userSession.user.email ?? "",
      action: AuditAction.RestoreMaterial,
      targetType: "material",
      targetId: materialId,
      details: `Restauration : ${material.designation || material.ref}`,
      ip: h.get("x-forwarded-for") ?? "",
      userAgent: h.get("user-agent") ?? "",
    });

    revalidatePath("/materials");
    revalidatePath("/trash");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ============================================================
   HARD DELETE — suppression définitive (admin only)
   ============================================================ */
export async function hardDeleteMaterialAction(
  materialId: string,
): Promise<DeleteState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };
  if (!can(userSession.user.role, "material:hard_delete")) {
    return {
      ok: false,
      error: "Seul un administrateur peut supprimer définitivement.",
    };
  }

  const material = await getMaterial(materialId);
  if (!material) return { ok: false, error: "Matériel introuvable." };

  try {
    await hardDeleteMaterial(materialId);

    const h = await headers();
    await logAudit({
      userId: userSession.user.id,
      userEmail: userSession.user.email ?? "",
      action: AuditAction.DeleteMaterial,
      targetType: "material",
      targetId: materialId,
      details: `Suppression DÉFINITIVE : ${material.designation || material.ref} (${material.ref})`,
      ip: h.get("x-forwarded-for") ?? "",
      userAgent: h.get("user-agent") ?? "",
    });

    revalidatePath("/trash");
    revalidatePath("/materials");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
