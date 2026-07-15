import { z } from "zod";

/* ============================================================
   PHARMACIE — Modèles de données
   Source de vérité : Google Sheets dédié (PHARMACIE_SHEET_ID)
   Architecture append-only : le stock est TOUJOURS recalculé
   depuis l'onglet mouvements, jamais stocké en cellule.
   ============================================================ */

/**
 * Champ texte tolérant au null — À UTILISER POUR TOUT CHAMP TEXTE OPTIONNEL.
 *
 * `z.string().default("")` ne suffit PAS : `.default()` ne se déclenche que sur
 * `undefined`, donc un `null` échoue à la validation. Or Supabase renvoie `null`
 * pour toute colonne vide (les onglets Sheets, eux, renvoient ""). Comme
 * `listProduits()` écarte silencieusement les lignes invalides (`.filter(p =>
 * p.success)`), un seul null faisait DISPARAÎTRE le produit de toute l'app sans
 * la moindre erreur — 18 des 65 produits étaient concernés à la bascule Supabase.
 */
const txt = () => z.string().nullish().transform((v) => v ?? "");

export const ProduitStatut = z.enum(["actif", "a_detruire", "archive"]);
export type ProduitStatut = z.infer<typeof ProduitStatut>;

export const Produit = z.object({
  id: z.string(),
  code: txt(),
  designation: z.string(),
  dci: txt(),
  classe: txt(),
  forme: txt(),
  dosage: txt(),
  conditionnement: txt(),
  // Les champs numériques sont déjà null-safe : Number(null) === 0.
  prix_achat: z.coerce.number().default(0),
  prix_vente: z.coerce.number().default(0),
  prix_unitaire: z.coerce.number().default(0),
  stock_min: z.coerce.number().default(0),
  fournisseur: txt(),
  emplacement: txt(),
  statut: z.preprocess((v) => v ?? "actif", ProduitStatut.default("actif")),
  createdAt: txt(),
});
export type Produit = z.infer<typeof Produit>;

export const Lot = z.object({
  id: z.string(),
  produit_id: z.string(),
  numero_lot: txt(),
  date_expiration: txt(),
  date_reception: txt(),
});
export type Lot = z.infer<typeof Lot>;

export const MouvementType = z.enum([
  "entree",
  "vente",
  "ajustement",
  "retour",
  "perte",
  "destruction",
]);
export type MouvementType = z.infer<typeof MouvementType>;

export const Mouvement = z.object({
  id: z.string(),
  timestamp: z.string(),
  produit_id: z.string(),
  lot_id: txt(),
  type: MouvementType,
  // Quantité SIGNÉE : entrée/retour > 0, vente/perte/destruction < 0,
  // ajustement dans les deux sens.
  quantite: z.coerce.number(),
  prix_unitaire: z.coerce.number().default(0),
  reference: txt(),
  user_email: txt(),
  note: txt(),
});
export type Mouvement = z.infer<typeof Mouvement>;

/** Produit enrichi du stock calculé et de la péremption la plus proche. */
export interface ProduitAvecStock extends Produit {
  stock: number;
  prochainePeremption: string | null;
  /** jours restants avant péremption (négatif = périmé) */
  joursAvantPeremption: number | null;
}

export const STATUT_LABELS: Record<ProduitStatut, { fr: string; it: string }> = {
  actif: { fr: "Actif", it: "Attivo" },
  a_detruire: { fr: "À détruire", it: "Da distruggere" },
  archive: { fr: "Archivé", it: "Archiviato" },
};
