"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  createMaterial,
  updateMaterial,
  getMaterial,
} from "@/lib/sheets/materials";
import { createMovement, classifyMovementType } from "@/lib/sheets/movements";
import { logAudit, AuditAction } from "@/lib/sheets/audit";
import type { Material, MaterialType, MaterialState } from "@/types";

export type MaterialFormState = {
  ok: boolean;
  error?: string;
  material?: Material;
};

function genId(ref: string): string {
  const slug = ref.replace(/[^a-zA-Z0-9]/g, "_");
  return `mat_${slug}_${Date.now().toString(36).slice(-4)}`;
}

function parseFormData(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return v === null ? "" : String(v).trim();
  };
  const getNum = (k: string) => {
    const v = get(k);
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const getBool = (k: string): boolean | undefined => {
    const v = get(k);
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
    return undefined;
  };

  return {
    ref: get("ref"),
    type: get("type") as MaterialType,
    designation: get("designation"),
    brand: get("brand") || undefined,
    model: get("model") || undefined,
    serialNumber: get("serialNumber") || undefined,
    siteId: get("siteId"),
    roomId: get("roomId"),
    service: get("service") || undefined,
    owner: get("owner") || undefined,
    assignedTo: get("assignedTo") || undefined,
    purchaseDate: get("purchaseDate") || undefined,
    purchasePrice: getNum("purchasePrice"),
    amortization: get("amortization") || undefined,
    os: get("os") || undefined,
    cpu: get("cpu") || undefined,
    ram: get("ram") || undefined,
    storage: get("storage") || undefined,
    ipAddress: get("ipAddress") || undefined,
    macAddress: get("macAddress") || undefined,
    internetAccess: getBool("internetAccess"),
    linkedToBDD: getBool("linkedToBDD"),
    state: (get("state") as MaterialState) || "operationnel",
    notes: get("notes") || undefined,
  };
}

/* ============================================================
   CREATE — ajout au parc + mouvement "création" + audit
   ============================================================ */
export async function createMaterialAction(
  formData: FormData,
): Promise<MaterialFormState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };
  if (!can(userSession.user.role, "material:create")) {
    return { ok: false, error: "Votre rôle n'autorise pas la création." };
  }

  const data = parseFormData(formData);

  if (!data.ref) return { ok: false, error: "La référence est requise." };
  if (!data.designation)
    return { ok: false, error: "La désignation est requise." };
  if (!data.type) return { ok: false, error: "Le type est requis." };
  if (!data.siteId) return { ok: false, error: "Le site est requis." };
  if (!data.roomId) return { ok: false, error: "La salle est requise." };

  const now = new Date().toISOString();
  const material: Material = {
    ...data,
    id: genId(data.ref),
    photos: [],
    createdAt: now,
    updatedAt: now,
  };

  try {
    await createMaterial(material);

    // Mouvement de création automatique
    try {
      await createMovement({
        materialId: material.id,
        type: "creation",
        toSiteId: material.siteId,
        toRoomId: material.roomId,
        toAssignedTo: material.assignedTo,
        byUserId: userSession.user.id,
        reason: "Création initiale",
      });
    } catch (e) {
      console.error("[material] creation movement log failed", e);
    }

    const h = await headers();
    await logAudit({
      userId: userSession.user.id,
      userEmail: userSession.user.email ?? "",
      action: AuditAction.EditMaterial,
      targetType: "material",
      targetId: material.id,
      details: `Création : ${material.designation} (${material.ref})`,
      ip: h.get("x-forwarded-for") ?? "",
      userAgent: h.get("user-agent") ?? "",
    });

    revalidatePath("/materials");
    revalidatePath("/dashboard");
    revalidatePath(`/sites/${material.siteId}/rooms/${material.roomId}`);

    return { ok: true, material };
  } catch (e) {
    return { ok: false, error: `Erreur Google Sheet : ${String(e)}` };
  }
}

/* ============================================================
   UPDATE — modification des champs + audit + mouvement si site/salle change
   ============================================================ */
export async function updateMaterialAction(
  materialId: string,
  formData: FormData,
): Promise<MaterialFormState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };
  if (!can(userSession.user.role, "material:update")) {
    return { ok: false, error: "Votre rôle n'autorise pas la modification." };
  }

  const current = await getMaterial(materialId);
  if (!current) return { ok: false, error: "Matériel introuvable." };

  const data = parseFormData(formData);
  if (!data.ref) return { ok: false, error: "La référence est requise." };
  if (!data.designation)
    return { ok: false, error: "La désignation est requise." };
  if (!data.siteId) return { ok: false, error: "Le site est requis." };
  if (!data.roomId) return { ok: false, error: "La salle est requise." };

  // Détecte si le transfert a eu lieu via le form d'édition
  const movementType = classifyMovementType({
    fromSiteId: current.siteId,
    fromRoomId: current.roomId,
    fromAssignedTo: current.assignedTo,
    toSiteId: data.siteId,
    toRoomId: data.roomId,
    toAssignedTo: data.assignedTo,
  });

  try {
    const updated = await updateMaterial(materialId, data);

    // Si déplacement détecté depuis le form d'édition, log le mouvement
    if (movementType) {
      try {
        await createMovement({
          materialId,
          type: movementType,
          fromSiteId: current.siteId,
          fromRoomId: current.roomId,
          fromAssignedTo: current.assignedTo,
          toSiteId: data.siteId,
          toRoomId: data.roomId,
          toAssignedTo: data.assignedTo,
          byUserId: userSession.user.id,
          reason: "Modification de la fiche",
        });
      } catch (e) {
        console.error("[material] movement log failed", e);
      }
    }

    const h = await headers();
    await logAudit({
      userId: userSession.user.id,
      userEmail: userSession.user.email ?? "",
      action: AuditAction.EditMaterial,
      targetType: "material",
      targetId: materialId,
      details: `Modification : ${updated.designation} (${updated.ref})${movementType ? ` — ${movementType}` : ""}`,
      ip: h.get("x-forwarded-for") ?? "",
      userAgent: h.get("user-agent") ?? "",
    });

    revalidatePath("/materials");
    revalidatePath("/dashboard");
    revalidatePath(`/materials/${materialId}`);

    return { ok: true, material: updated };
  } catch (e) {
    return { ok: false, error: `Erreur Google Sheet : ${String(e)}` };
  }
}

// Wrapper form-action (redirect après succès) pour create
export async function createMaterialFormAction(formData: FormData) {
  const result = await createMaterialAction(formData);
  if (result.ok && result.material) {
    redirect(`/materials/${result.material.id}`);
  }
}
