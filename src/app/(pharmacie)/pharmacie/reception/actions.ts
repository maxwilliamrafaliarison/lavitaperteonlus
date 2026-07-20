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
import { facteur } from "@/lib/pharmacie/fractionnement";
import { getT, isLang } from "@/lib/i18n";

const ReceptionInput = z.object({
  produitId: z.string().min(1),
  // Quantité reçue en BOÎTES (l'unité d'une livraison fournisseur).
  quantite: z.number().int().positive().max(100_000),
  numeroLot: z.string().trim().max(60).default(""),
  dateExpiration: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(""))
    .default(""),
  prixUnitaire: z.number().nonnegative().default(0),
  // Contenance (boîte, flacon, tube, autre) — pour le registre des entrées.
  contenance: z.string().trim().max(30).default(""),
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
  const f = facteur(produit);

  // Une réception se compte en BOÎTES. Le mouvement de stock est toujours en
  // unités de base : recevoir 10 boîtes d'un produit à 30 comprimés ajoute
  // 300 comprimés, pas 10. (Avant ce correctif, on écrivait la quantité
  // brute — invisible tant que tous les produits ont un facteur de 1, faux
  // dès le premier produit fractionné.)
  const quantiteBase = input.quantite * f;

  try {
    // On crée TOUJOURS un lot, même sans numéro ni péremption : c'est le lot
    // qui porte le stock (compartiment GROS) et que le FEFO consommera. Une
    // entrée sans lot laisserait du stock flottant, non alloué.
    const lotId = genId("LOT");
    await appendRows(PHARMA_SHEETS.lots, [
      [
        lotId,
        produit.id,
        input.numeroLot || lotId,
        input.dateExpiration,
        timestamp.slice(0, 10),
        input.contenance,
      ],
    ]);

    // Mouvement d'entrée en GROS (réserve, boîtes fermées). unite_saisie et
    // facteur_applique sont l'AUDIT de ce qui a été saisi ; quantite est la
    // seule source du stock, en unités de base.
    await appendRows(PHARMA_SHEETS.mouvements, [
      [
        mouvementId,
        timestamp,
        produit.id,
        lotId,
        "entree",
        quantiteBase,
        input.prixUnitaire,
        "reception",
        email,
        input.note || `Réception fournisseur`,
        "boite",
        f,
        "gros",
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
