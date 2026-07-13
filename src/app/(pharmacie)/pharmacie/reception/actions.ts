"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  appendRows,
  listProduits,
  PHARMA_SHEETS,
} from "@/lib/pharmacie/sheets";
import { getT, isLang } from "@/lib/i18n";

const ReceptionInput = z.object({
  produitId: z.string().min(1),
  quantite: z.number().int().positive().max(100_000),
  numeroLot: z.string().trim().max(60).default(""),
  dateExpiration: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(""))
    .default(""),
  prixUnitaire: z.number().nonnegative().default(0),
  note: z.string().trim().max(200).default(""),
});

export type ReceptionResult =
  | { ok: true; mouvementId: string }
  | { ok: false; error: string };

function genId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

export async function recevoirStockAction(raw: unknown): Promise<ReceptionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  const lang = isLang(session.user.lang) ? session.user.lang : "fr";
  const t = getT(lang);

  if (!can(session.user.role, "pharmacie:stock")) {
    return { ok: false, error: t("pharmacie.reception_error_forbidden") };
  }

  const parsed = ReceptionInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: t("pharmacie.reception_error_invalid") };
  }
  const input = parsed.data;

  const produits = await listProduits();
  const produit = produits.find((p) => p.id === input.produitId);
  if (!produit) {
    return { ok: false, error: t("pharmacie.vente_error_produit") };
  }

  const timestamp = new Date().toISOString();
  const email = session.user.email ?? "";
  const mouvementId = genId("MVT");

  try {
    // Nouveau lot si numéro ou péremption fournis
    let lotId = "";
    if (input.numeroLot || input.dateExpiration) {
      lotId = genId("LOT");
      await appendRows(PHARMA_SHEETS.lots, [
        [
          lotId,
          produit.id,
          input.numeroLot || lotId,
          input.dateExpiration,
          timestamp.slice(0, 10),
        ],
      ]);
    }

    await appendRows(PHARMA_SHEETS.mouvements, [
      [
        mouvementId,
        timestamp,
        produit.id,
        lotId,
        "entree",
        input.quantite,
        input.prixUnitaire,
        "reception",
        email,
        input.note || `Réception fournisseur`,
      ],
    ]);
  } catch (e) {
    return {
      ok: false,
      error: t("pharmacie.vente_error_write", { detail: String(e).slice(0, 120) }),
    };
  }

  revalidatePath("/pharmacie");
  revalidatePath("/pharmacie/reception");
  return { ok: true, mouvementId };
}
