"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  appendRows,
  getVenteComplete,
  marquerVenteAnnulee,
  PHARMA_SHEETS,
} from "@/lib/pharmacie/sheets";
import { getT, isLang } from "@/lib/i18n";

export type AnnulationResult = { ok: true } | { ok: false; error: string };

/**
 * Annule une vente : statut → annulee, puis mouvements compensatoires
 * « retour » (+quantité) pour remettre le stock — jamais de suppression,
 * la vente et son annulation restent toutes deux tracées.
 */
export async function annulerVenteAction(
  venteId: string,
): Promise<AnnulationResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  const lang = isLang(session.user.lang) ? session.user.lang : "fr";
  const t = getT(lang);

  if (!can(session.user.role, "pharmacie:vendre")) {
    return { ok: false, error: t("pharmacie.vente_error_forbidden") };
  }
  if (!/^VTE-[A-Z0-9-]{6,40}$/.test(venteId)) {
    return { ok: false, error: t("pharmacie.annul_error_introuvable") };
  }

  const vente = await getVenteComplete(venteId);
  if (!vente) {
    return { ok: false, error: t("pharmacie.annul_error_introuvable") };
  }
  if (vente.statut === "annulee") {
    return { ok: false, error: t("pharmacie.annul_error_deja") };
  }

  const timestamp = new Date().toISOString();
  const email = session.user.email ?? "";

  try {
    // 1. Statut d'abord : si l'étape 2 échoue, la vente est déjà
    //    marquée annulée et le stock se corrige par ajustement manuel.
    const marked = await marquerVenteAnnulee(venteId);
    if (!marked) {
      return { ok: false, error: t("pharmacie.annul_error_introuvable") };
    }

    // 2. Remise en stock compensatoire (quantités positives)
    await appendRows(
      PHARMA_SHEETS.mouvements,
      vente.lignes.map((l, i) => [
        `MVT-ANNUL-${venteId}-${i + 1}`,
        timestamp,
        l.produitId,
        l.lotId,
        "retour",
        l.quantite,
        l.prixUnitaire,
        `ANNUL-${venteId}`,
        email,
        `Annulation de ${venteId}`,
      ]),
    );
  } catch (e) {
    return {
      ok: false,
      error: t("pharmacie.vente_error_write", { detail: String(e).slice(0, 120) }),
    };
  }

  revalidatePath("/pharmacie");
  revalidatePath("/pharmacie/ventes");
  return { ok: true };
}
