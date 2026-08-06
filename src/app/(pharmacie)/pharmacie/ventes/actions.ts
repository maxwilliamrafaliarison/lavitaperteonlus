"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  appendRows,
  getVenteComplete,
  marquerVenteAnnulee,
  listMouvementsDeVente,
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

    // 2. Remise en stock : MIROIR EXACT des mouvements de vente, lot par lot
    //    ET compartiment par compartiment. On relit les mouvements 'vente' de
    //    la vente (chacun porte son lot, son compartiment et sa quantité de
    //    base) et on les inverse. On ne reverse PAS les 'transfert' : la boîte
    //    reste physiquement ouverte, les unités reviennent simplement en
    //    DÉTAIL — le total produit est exact, la répartition honnêtement
    //    différente. (Avant, on repostait la quantité en unité DU MODE :
    //    annuler 2 boîtes d'un produit à 30 rendait +2 comprimés au lieu de
    //    +60 — du stock s'évaporait.)
    //
    //    IDs déterministes 'MVT-ANNUL-<id du mouvement source>' : une double
    //    annulation (course réseau) ne double-restocke pas — la clé primaire
    //    rejette le doublon.
    const mouvements = await listMouvementsDeVente(venteId);
    const aRestaurer = mouvements.filter((m) => m.type === "vente");
    if (aRestaurer.length > 0) {
      await appendRows(
        PHARMA_SHEETS.mouvements,
        aRestaurer.map((m) => [
          `MVT-ANNUL-${m.id}`,
          timestamp,
          m.produit_id,
          m.lot_id,
          "retour",
          // Le mouvement de vente était négatif (unités de base) ; on inverse.
          -m.quantite,
          m.prix_unitaire,
          `ANNUL-${venteId}`,
          email,
          `Annulation de ${venteId}`,
          m.unite_saisie,
          m.facteur_applique,
          m.compartiment,
        ]),
      );
    }
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

/* ============================================================
   DÉTAIL D'UNE VENTE — chargé à la demande
   ============================================================
   Les lignes ne voyagent PAS avec la liste : une journée chargée
   compterait plusieurs centaines de lignes qu'on n'ouvrira jamais, et la
   page mettrait d'autant plus de temps à s'afficher. On les va chercher
   au moment où quelqu'un déplie une vente — le seul moment où elles
   servent.
   ============================================================ */

export type DetailResult =
  | {
      ok: true;
      lignes: Array<{
        designation: string;
        dosage: string;
        quantite: number;
        prixUnitaire: number;
        sousTotal: number;
        galenique: boolean;
      }>;
      clientNom: string;
      pecPayeur: string;
    }
  | { ok: false; error: string };

export async function detailVenteAction(venteId: string): Promise<DetailResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  const lang = isLang(session.user.lang) ? session.user.lang : "fr";
  const t = getT(lang);
  if (!can(session.user.role, "app:pharmacie")) {
    return { ok: false, error: t("pharmacie.vente_error_forbidden") };
  }
  // Format contrôlé : l'identifiant part dans un filtre.
  if (!/^VTE-[A-Z0-9-]{4,40}$/.test(venteId)) {
    return { ok: false, error: t("pharmacie.vente_error_invalid") };
  }

  try {
    const { getVenteComplete } = await import("@/lib/pharmacie/sheets");
    const vente = await getVenteComplete(venteId);
    if (!vente) return { ok: false, error: t("pharmacie.vente_error_produit") };
    return {
      ok: true,
      clientNom: vente.clientNom,
      pecPayeur: vente.pecPayeur,
      lignes: vente.lignes.map((l) => ({
        designation: l.designation,
        dosage: l.dosage,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        sousTotal: l.sousTotal,
        galenique: l.galenique,
      })),
    };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }
}
