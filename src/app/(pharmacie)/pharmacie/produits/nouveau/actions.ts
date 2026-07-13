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

const ProduitInput = z.object({
  designation: z.string().trim().min(2).max(120),
  dci: z.string().trim().max(120).default(""),
  classe: z.string().trim().max(80).default(""),
  forme: z.string().trim().max(60).default(""),
  dosage: z.string().trim().max(60).default(""),
  conditionnement: z.string().trim().max(80).default(""),
  prixAchat: z.number().nonnegative().default(0),
  prixVente: z.number().nonnegative().default(0),
  stockMin: z.number().int().nonnegative().default(0),
  emplacement: z.string().trim().max(80).default(""),
  fournisseur: z.string().trim().max(80).default(""),
  // Stock initial optionnel
  quantiteInitiale: z.number().int().nonnegative().default(0),
  numeroLot: z.string().trim().max(60).default(""),
  dateExpiration: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(""))
    .default(""),
});

export type CreerProduitResult =
  | { ok: true; produitId: string }
  | { ok: false; error: string };

export async function creerProduitAction(
  raw: unknown,
): Promise<CreerProduitResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  const lang = isLang(session.user.lang) ? session.user.lang : "fr";
  const t = getT(lang);

  if (!can(session.user.role, "pharmacie:stock")) {
    return { ok: false, error: t("pharmacie.reception_error_forbidden") };
  }

  const parsed = ProduitInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: t("pharmacie.produit_error_invalid") };
  }
  const input = parsed.data;

  const produits = await listProduits();

  // Doublon : même désignation + même dosage
  const doublon = produits.find(
    (p) =>
      p.designation.trim().toLowerCase() ===
        input.designation.trim().toLowerCase() &&
      p.dosage.trim().toLowerCase() === input.dosage.trim().toLowerCase(),
  );
  if (doublon) {
    return {
      ok: false,
      error: t("pharmacie.produit_error_doublon", { id: doublon.id }),
    };
  }

  // ID séquentiel PHA-NNN. Course théorique si deux créations strictement
  // simultanées ; acceptable pour un poste pharmacie (création rare).
  const maxNum = produits.reduce((max, p) => {
    const m = /^PHA-(\d+)$/.exec(p.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  const produitId = `PHA-${String(maxNum + 1).padStart(3, "0")}`;

  const timestamp = new Date().toISOString();
  const email = session.user.email ?? "";

  try {
    await appendRows(PHARMA_SHEETS.produits, [
      [
        produitId,
        produitId,
        input.designation,
        input.dci,
        input.classe,
        input.forme,
        input.dosage,
        input.conditionnement,
        input.prixAchat,
        input.prixVente,
        input.prixVente,
        input.stockMin,
        input.fournisseur,
        input.emplacement,
        "actif",
        timestamp,
      ],
    ]);

    if (input.quantiteInitiale > 0) {
      let lotId = "";
      if (input.numeroLot || input.dateExpiration) {
        lotId = `LOT-${produitId}`;
        await appendRows(PHARMA_SHEETS.lots, [
          [
            lotId,
            produitId,
            input.numeroLot || lotId,
            input.dateExpiration,
            timestamp.slice(0, 10),
          ],
        ]);
      }
      await appendRows(PHARMA_SHEETS.mouvements, [
        [
          `MVT-INIT-${produitId}`,
          timestamp,
          produitId,
          lotId,
          "entree",
          input.quantiteInitiale,
          input.prixAchat,
          "creation-produit",
          email,
          "Stock initial à la création du produit",
        ],
      ]);
    }
  } catch (e) {
    return {
      ok: false,
      error: t("pharmacie.vente_error_write", { detail: String(e).slice(0, 120) }),
    };
  }

  revalidatePath("/pharmacie");
  revalidatePath("/pharmacie/reception");
  revalidatePath("/pharmacie/produits/nouveau");
  return { ok: true, produitId };
}
