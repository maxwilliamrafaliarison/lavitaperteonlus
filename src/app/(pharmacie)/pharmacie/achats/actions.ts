"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { enregistrerAchat, listProduits } from "@/lib/pharmacie/sheets";
import { facteur } from "@/lib/pharmacie/fractionnement";
import { getT, isLang } from "@/lib/i18n";

/** Une ligne de facture : un produit, un lot, une quantité de boîtes. */
const AchatLigneInput = z.object({
  produitId: z.string().min(1),
  /** Contenance d'une unité de conditionnement (ex. « 30 comprimés »). */
  contenance: z.string().trim().max(60).default(""),
  /** Quantité reçue en BOÎTES, telle qu'elle figure sur la facture/BL. */
  quantite: z.number().int().positive().max(100_000),
  dateExpiration: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(""))
    .default(""),
  numeroLot: z.string().trim().max(60).default(""),
  /** Montant Ariary de la ligne (total, pas unitaire). */
  montant: z.number().nonnegative().max(1_000_000_000).default(0),
});

const AchatInput = z.object({
  dateFacture: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(""))
    .default(""),
  /** Origine : nom du fournisseur (choisi dans la liste ou saisi librement). */
  fournisseur: z.string().trim().max(120).default(""),
  numFacture: z.string().trim().max(60).default(""),
  numBl: z.string().trim().max(60).default(""),
  note: z.string().trim().max(200).default(""),
  lignes: z.array(AchatLigneInput).min(1).max(100),
});

export type AchatResult =
  | { ok: true; achatId: string }
  | { ok: false; error: string };

function genId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

/**
 * Enregistre une entrée de stock = un document fournisseur (facture/BL) à
 * plusieurs lignes. Chaque ligne crée un lot GROS neuf et un mouvement
 * 'entree' en unités de base. Tout est écrit atomiquement (RPC
 * enregistrer_achat) : la facture entre entièrement ou pas du tout.
 *
 * La quantité SAISIE est en boîtes (l'unité d'une livraison) ; le stock,
 * lui, bouge toujours en unités de base — recevoir 10 boîtes d'un produit
 * fractionné en 30 ajoute 300 unités, pas 10.
 */
export async function enregistrerAchatAction(raw: unknown): Promise<AchatResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  const lang = isLang(session.user.lang) ? session.user.lang : "fr";
  const t = getT(lang);

  if (!can(session.user.role, "pharmacie:stock")) {
    return { ok: false, error: t("pharmacie.reception_error_forbidden") };
  }

  const parsed = AchatInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: t("pharmacie.reception_error_invalid") };
  }
  const input = parsed.data;

  const produits = await listProduits();
  const parId = new Map(produits.map((p) => [p.id, p]));

  const timestamp = new Date().toISOString();
  const today = timestamp.slice(0, 10);
  const email = session.user.email ?? "";
  const achatId = genId("ACH");

  const lignesRows: unknown[][] = [];
  const lotsRows: unknown[][] = [];
  const mouvementsRows: unknown[][] = [];
  let montantTotal = 0;

  for (const [i, ligne] of input.lignes.entries()) {
    const produit = parId.get(ligne.produitId);
    if (!produit) {
      return {
        ok: false,
        error: t("pharmacie.achat_error_produit", { n: i + 1 }),
      };
    }

    const f = facteur(produit);
    const quantiteBase = ligne.quantite * f;
    // Coût d'achat par unité de base — pratique pour la valorisation du
    // stock ; le total de la ligne reste `montant` dans le registre.
    const prixUnitaire =
      quantiteBase > 0 ? Math.round(ligne.montant / quantiteBase) : 0;
    const lotId = genId("LOT");
    const numeroLot = ligne.numeroLot || lotId;

    lignesRows.push([
      `${achatId}-L${i + 1}`,
      achatId,
      produit.id,
      produit.designation,
      ligne.contenance,
      ligne.quantite,
      ligne.dateExpiration,
      numeroLot,
      ligne.montant,
    ]);

    lotsRows.push([
      lotId,
      produit.id,
      numeroLot,
      ligne.dateExpiration,
      today,
      ligne.contenance,
    ]);

    mouvementsRows.push([
      `${achatId}-M${i + 1}`,
      timestamp,
      produit.id,
      lotId,
      "entree",
      quantiteBase,
      prixUnitaire,
      achatId,
      email,
      input.numFacture
        ? `Achat ${input.numFacture}`
        : t("pharmacie.achat_note_defaut"),
      "boite",
      f,
      "gros",
    ]);

    montantTotal += ligne.montant;
  }

  const achatRow = [
    achatId,
    timestamp,
    input.dateFacture,
    input.fournisseur,
    input.numFacture,
    input.numBl,
    montantTotal,
    email,
    "valide",
    input.note,
  ];

  try {
    await enregistrerAchat({ achatRow, lignesRows, lotsRows, mouvementsRows });
  } catch (e) {
    return {
      ok: false,
      error: t("pharmacie.vente_error_write", { detail: String(e).slice(0, 120) }),
    };
  }

  revalidatePath("/pharmacie");
  revalidatePath("/pharmacie/achats");
  revalidatePath("/pharmacie/reception");
  return { ok: true, achatId };
}
