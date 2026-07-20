"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  appendRows,
  listProduitsAvecStock,
  listStockParLot,
  PHARMA_SHEETS,
} from "@/lib/pharmacie/sheets";
import { estFractionnable, facteur } from "@/lib/pharmacie/fractionnement";
import { getT, isLang } from "@/lib/i18n";

const TransfertInput = z.object({
  produitId: z.string().min(1),
  lotId: z.string().min(1),
  /** "ouvrir" : GROS → DÉTAIL (ouvrir des boîtes) ; "refermer" : l'inverse. */
  sens: z.enum(["ouvrir", "refermer"]),
  /** Nombre de BOÎTES entières à déplacer. */
  nbBoites: z.number().int().positive().max(100_000),
});

export type TransfertResult = { ok: true } | { ok: false; error: string };

function genId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

/**
 * Déplace des boîtes ENTIÈRES entre la réserve (GROS) et le rayon (DÉTAIL)
 * d'un lot précis. « Ouvrir » sort des boîtes de la réserve pour les rendre
 * vendables à l'unité ; « refermer » remet des unités en réserve.
 *
 * Le mouvement est net nul sur le stock du produit : deux lignes de type
 * 'transfert' (−q sur un compartiment, +q sur l'autre) du MÊME lot, écrites
 * en un seul appel — elles tombent donc ensemble ou pas du tout. La
 * péremption du lot est conservée (on ne fait que déplacer, pas transformer).
 */
export async function transfererAction(raw: unknown): Promise<TransfertResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  const lang = isLang(session.user.lang) ? session.user.lang : "fr";
  const t = getT(lang);

  if (!can(session.user.role, "pharmacie:stock")) {
    return { ok: false, error: t("pharmacie.reception_error_forbidden") };
  }
  const parsed = TransfertInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: t("pharmacie.produit_error_invalid") };
  }
  const { produitId, lotId, sens, nbBoites } = parsed.data;

  const produit = (await listProduitsAvecStock()).find((p) => p.id === produitId);
  if (!produit) return { ok: false, error: t("pharmacie.vente_error_produit") };

  // Transférer n'a de sens que pour un produit vendable à l'unité : sinon la
  // notion de boîte ouverte n'existe pas.
  if (!estFractionnable(produit)) {
    return { ok: false, error: t("pharmacie.transfert_error_non_fract") };
  }

  const f = facteur(produit);
  const base = nbBoites * f;

  // État réel du lot visé (somme des mouvements, jamais une cellule stockée).
  const bucket = (await listStockParLot())
    .get(produitId)
    ?.find((l) => l.lotId === lotId);
  if (!bucket) return { ok: false, error: t("pharmacie.transfert_error_lot") };

  const source = sens === "ouvrir" ? bucket.gros : bucket.detail;
  if (source < base) {
    return {
      ok: false,
      error: t("pharmacie.transfert_error_insuffisant", {
        n: Math.floor(source / f),
      }),
    };
  }

  const timestamp = new Date().toISOString();
  const email = session.user.email ?? "";
  const ref = genId("TRF");
  const note =
    sens === "ouvrir"
      ? `Ouverture ${nbBoites} boîte(s)`
      : `Fermeture ${nbBoites} boîte(s)`;
  const [compSortie, compEntree] =
    sens === "ouvrir" ? ["gros", "detail"] : ["detail", "gros"];

  try {
    // Les deux lignes en UN appel = écriture atomique (un seul INSERT).
    await appendRows(PHARMA_SHEETS.mouvements, [
      [`${ref}-1`, timestamp, produitId, lotId, "transfert", -base, 0, ref, email, note, "boite", f, compSortie],
      [`${ref}-2`, timestamp, produitId, lotId, "transfert", base, 0, ref, email, note, "boite", f, compEntree],
    ]);
  } catch (e) {
    return {
      ok: false,
      error: t("pharmacie.vente_error_write", { detail: String(e).slice(0, 120) }),
    };
  }

  revalidatePath("/pharmacie");
  revalidatePath("/pharmacie/transfert");
  return { ok: true };
}
