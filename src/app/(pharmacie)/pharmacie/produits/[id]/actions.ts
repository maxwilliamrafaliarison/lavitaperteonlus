"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  appendRows,
  listProduitsAvecStock,
  updateProduitFields,
  PHARMA_SHEETS,
} from "@/lib/pharmacie/sheets";
import { ProduitStatut } from "@/lib/pharmacie/types";
import { getT, isLang } from "@/lib/i18n";

export type ProduitActionResult = { ok: true } | { ok: false; error: string };

const ModifInput = z.object({
  produitId: z.string().min(1),
  prixAchat: z.number().nonnegative(),
  prixVente: z.number().nonnegative(),
  stockMin: z.number().int().nonnegative(),
  fournisseur: z.string().trim().max(80),
  emplacement: z.string().trim().max(80),
  statut: ProduitStatut,
});

export async function modifierProduitAction(
  raw: unknown,
): Promise<ProduitActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  const lang = isLang(session.user.lang) ? session.user.lang : "fr";
  const t = getT(lang);

  if (!can(session.user.role, "pharmacie:stock")) {
    return { ok: false, error: t("pharmacie.reception_error_forbidden") };
  }
  const parsed = ModifInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: t("pharmacie.produit_error_invalid") };
  }
  const input = parsed.data;

  try {
    const found = await updateProduitFields(input.produitId, {
      prix_achat: input.prixAchat,
      prix_vente: input.prixVente,
      stock_min: input.stockMin,
      fournisseur: input.fournisseur,
      emplacement: input.emplacement,
      statut: input.statut,
    });
    if (!found) {
      return { ok: false, error: t("pharmacie.vente_error_produit") };
    }
  } catch (e) {
    return {
      ok: false,
      error: t("pharmacie.vente_error_write", { detail: String(e).slice(0, 120) }),
    };
  }

  revalidatePath("/pharmacie");
  revalidatePath(`/pharmacie/produits/${input.produitId}`);
  return { ok: true };
}

const AjustInput = z.object({
  produitId: z.string().min(1),
  stockPhysique: z.number().int().nonnegative().max(1_000_000),
  note: z.string().trim().max(200).default(""),
});

/**
 * Ajustement d'inventaire : on saisit le stock PHYSIQUE compté, le
 * système calcule l'écart avec le stock théorique et l'enregistre
 * comme mouvement « ajustement » signé. Trace complète, pas d'update.
 */
export async function ajusterStockAction(
  raw: unknown,
): Promise<ProduitActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  const lang = isLang(session.user.lang) ? session.user.lang : "fr";
  const t = getT(lang);

  if (!can(session.user.role, "pharmacie:stock")) {
    return { ok: false, error: t("pharmacie.reception_error_forbidden") };
  }
  const parsed = AjustInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: t("pharmacie.produit_error_invalid") };
  }
  const { produitId, stockPhysique, note } = parsed.data;

  const produits = await listProduitsAvecStock();
  const produit = produits.find((p) => p.id === produitId);
  if (!produit) return { ok: false, error: t("pharmacie.vente_error_produit") };

  const delta = stockPhysique - produit.stock;
  if (delta === 0) {
    return { ok: false, error: t("pharmacie.ajust_error_egal") };
  }

  const timestamp = new Date().toISOString();
  try {
    await appendRows(PHARMA_SHEETS.mouvements, [
      [
        `MVT-AJUST-${Date.now().toString(36).toUpperCase()}`,
        timestamp,
        produitId,
        "",
        "ajustement",
        delta,
        produit.prix_achat,
        "inventaire",
        session.user.email ?? "",
        note ||
          `Inventaire : théorique ${produit.stock} → physique ${stockPhysique}`,
      ],
    ]);
  } catch (e) {
    return {
      ok: false,
      error: t("pharmacie.vente_error_write", { detail: String(e).slice(0, 120) }),
    };
  }

  revalidatePath("/pharmacie");
  revalidatePath(`/pharmacie/produits/${produitId}`);
  return { ok: true };
}
