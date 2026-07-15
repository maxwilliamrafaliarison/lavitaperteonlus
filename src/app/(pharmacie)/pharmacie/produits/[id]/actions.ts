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
import { estFractionnable } from "@/lib/pharmacie/fractionnement";
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

  // GARDE-FOU : l'écran d'inventaire n'a qu'un seul champ, donc la quantité
  // saisie est forcément dans l'unité de base — ce qui n'est vrai que tant
  // que le produit n'est pas fractionné (1 boîte = 1 unité de base).
  // Sur un produit fractionné, le pharmacien compterait des BOÎTES : avec
  // 600 comprimés en stock (20 boîtes), saisir 20 donnerait delta = −580 et
  // écraserait le stock. L'écran censé corriger l'inventaire le détruirait.
  // Tant qu'il ne sait pas distinguer boîtes pleines et appoint (tranche
  // suivante), on refuse plutôt que de détruire.
  if (estFractionnable(produit)) {
    return { ok: false, error: t("pharmacie.ajust_error_fractionnable") };
  }

  const delta = stockPhysique - produit.stockBase;
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
          `Inventaire : théorique ${produit.stockBase} → physique ${stockPhysique}`,
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

/* ============================================================
   FRACTIONNEMENT — déclarer un produit vendable à l'unité
   ============================================================ */

const FractInput = z.object({
  produitId: z.string().min(1),
  /** Unités de base par boîte. 1 = produit non fractionnable. */
  facteurConversion: z.number().int().min(1).max(10_000),
  uniteDetail: z.string().trim().max(30),
  prixVenteDetail: z.number().nonnegative().max(100_000_000),
});

export type FractResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Change le facteur de conversion d'un produit — donc, potentiellement,
 * L'UNITÉ DANS LAQUELLE SON STOCK EST COMPTÉ. Trois cas, et un seul est
 * anodin :
 *
 *  (a) 1 → N   le stock passait des boîtes aux comprimés : 20 boîtes
 *              deviennent 600 comprimés. Conversion OBLIGATOIRE, sinon
 *              20 boîtes se reliraient comme 20 comprimés.
 *  (b) N → 1   retour aux boîtes : 605 comprimés donnent 20 boîtes, et
 *              l'appoint de 5 comprimés est PERDU (il n'y a plus d'unité
 *              pour l'exprimer). Annoncé avant confirmation.
 *  (c) N → M   le comprimé reste le comprimé : 600 restent 600, le seuil
 *              ne bouge pas. AUCUNE conversion. C'est le cas du fournisseur
 *              qui passe de 30 à 60 par boîte — et c'est précisément ce que
 *              la convention « tout en unités de base » rend gratuit.
 *
 * La conversion s'écrit comme un mouvement d'ajustement, jamais comme une
 * réécriture du stock : l'append-only reste la seule vérité.
 */
export async function definirFractionnementAction(
  raw: unknown,
): Promise<FractResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  const lang = isLang(session.user.lang) ? session.user.lang : "fr";
  const t = getT(lang);

  if (!can(session.user.role, "pharmacie:stock")) {
    return { ok: false, error: t("pharmacie.reception_error_forbidden") };
  }
  const parsed = FractInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: t("pharmacie.produit_error_invalid") };
  }
  const { produitId, facteurConversion, uniteDetail, prixVenteDetail } = parsed.data;

  // Un produit fractionnable SANS libellé d'unité afficherait « 3 » sans
  // dire 3 quoi. La base refuse aussi (contrainte produits_facteur_chk).
  if (facteurConversion > 1 && !uniteDetail) {
    return { ok: false, error: t("pharmacie.fract_error_unite") };
  }

  const produits = await listProduitsAvecStock();
  const produit = produits.find((p) => p.id === produitId);
  if (!produit) return { ok: false, error: t("pharmacie.vente_error_produit") };

  const ancien = produit.facteur_conversion;
  if (ancien === facteurConversion) {
    // Le facteur ne bouge pas : l'unité du stock non plus. On ne touche
    // qu'aux champs commerciaux, sans convertir quoi que ce soit.
    const found = await updateProduitFields(produitId, {
      unite_detail: facteurConversion > 1 ? uniteDetail : "",
      prix_vente_detail: facteurConversion > 1 ? prixVenteDetail : 0,
    });
    if (!found) return { ok: false, error: t("pharmacie.vente_error_produit") };
    revalidatePath("/pharmacie");
    revalidatePath(`/pharmacie/produits/${produitId}`);
    return { ok: true, message: t("pharmacie.fract_ok_prix") };
  }

  // L'unité de base ne change QUE lorsqu'on franchit la frontière du 1.
  const uniteChange = ancien === 1 || facteurConversion === 1;
  let nouveauStockBase = produit.stockBase;
  let appointPerdu = 0;

  if (uniteChange) {
    if (ancien === 1) {
      // (a) boîtes → unités de base
      nouveauStockBase = produit.stockBase * facteurConversion;
    } else {
      // (b) unités de base → boîtes. Math.trunc : sur un stock négatif,
      // floor produirait une boîte de plus que la réalité.
      nouveauStockBase = Math.trunc(produit.stockBase / ancien);
      appointPerdu = produit.stockBase - nouveauStockBase * ancien;
    }
  }

  const delta = nouveauStockBase - produit.stockBase;
  const timestamp = new Date().toISOString();

  try {
    // 1. La conversion du stock, s'il y en a une, s'écrit comme un mouvement.
    if (delta !== 0) {
      await appendRows(PHARMA_SHEETS.mouvements, [
        [
          `MVT-FRACT-${Date.now().toString(36).toUpperCase()}`,
          timestamp,
          produitId,
          "",
          "ajustement",
          delta,
          produit.prix_achat,
          "fractionnement",
          session.user.email ?? "",
          ancien === 1
            ? `Passage à la vente à l'unité : ${produit.stockBase} bte × ${facteurConversion} = ${nouveauStockBase} ${uniteDetail}`
            : `Retour à la vente par boîte : ${produit.stockBase} ${produit.unite_detail} ÷ ${ancien} = ${nouveauStockBase} bte` +
              (appointPerdu ? ` (${appointPerdu} en appoint, perdu)` : ""),
          // Traçabilité : ce qui a été saisi, pour que le kardex reste vrai.
          ancien === 1 ? "boite" : "detail",
          ancien === 1 ? facteurConversion : ancien,
        ],
      ]);
    }

    // 2. Le seuil suit l'unité du stock — il est exprimé dans la même.
    //    Cas (c) : ni le stock ni le seuil ne bougent.
    const nouveauSeuil = uniteChange
      ? ancien === 1
        ? produit.stock_min * facteurConversion
        : Math.ceil(produit.stock_min / ancien)
      : produit.stock_min;

    const found = await updateProduitFields(produitId, {
      facteur_conversion: facteurConversion,
      unite_detail: facteurConversion > 1 ? uniteDetail : "",
      prix_vente_detail: facteurConversion > 1 ? prixVenteDetail : 0,
      stock_min: nouveauSeuil,
    });
    if (!found) return { ok: false, error: t("pharmacie.vente_error_produit") };
  } catch (e) {
    return {
      ok: false,
      error: t("pharmacie.vente_error_write", { detail: String(e).slice(0, 120) }),
    };
  }

  revalidatePath("/pharmacie");
  revalidatePath(`/pharmacie/produits/${produitId}`);

  if (!uniteChange) {
    // (c) : le plus fréquent en pratique, et le plus rassurant à annoncer.
    return { ok: true, message: t("pharmacie.fract_ok_facteur", { n: facteurConversion }) };
  }
  if (ancien === 1) {
    return {
      ok: true,
      message: t("pharmacie.fract_ok_active", { stock: nouveauStockBase, u: uniteDetail }),
    };
  }
  return {
    ok: true,
    message: appointPerdu
      ? t("pharmacie.fract_ok_desactive_perte", { stock: nouveauStockBase, perdu: appointPerdu })
      : t("pharmacie.fract_ok_desactive", { stock: nouveauStockBase }),
  };
}
