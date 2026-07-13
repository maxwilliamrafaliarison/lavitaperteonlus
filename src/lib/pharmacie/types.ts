import { z } from "zod";

/* ============================================================
   PHARMACIE — Modèles de données
   Source de vérité : Google Sheets dédié (PHARMACIE_SHEET_ID)
   Architecture append-only : le stock est TOUJOURS recalculé
   depuis l'onglet mouvements, jamais stocké en cellule.
   ============================================================ */

export const ProduitStatut = z.enum(["actif", "a_detruire", "archive"]);
export type ProduitStatut = z.infer<typeof ProduitStatut>;

export const Produit = z.object({
  id: z.string(),
  code: z.string().default(""),
  designation: z.string(),
  dci: z.string().default(""),
  classe: z.string().default(""),
  forme: z.string().default(""),
  dosage: z.string().default(""),
  conditionnement: z.string().default(""),
  prix_achat: z.coerce.number().default(0),
  prix_vente: z.coerce.number().default(0),
  prix_unitaire: z.coerce.number().default(0),
  stock_min: z.coerce.number().default(0),
  fournisseur: z.string().default(""),
  emplacement: z.string().default(""),
  statut: ProduitStatut.default("actif"),
  createdAt: z.string().default(""),
});
export type Produit = z.infer<typeof Produit>;

export const Lot = z.object({
  id: z.string(),
  produit_id: z.string(),
  numero_lot: z.string().default(""),
  date_expiration: z.string().default(""),
  date_reception: z.string().default(""),
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
  lot_id: z.string().default(""),
  type: MouvementType,
  // Quantité SIGNÉE : entrée/retour > 0, vente/perte/destruction < 0,
  // ajustement dans les deux sens.
  quantite: z.coerce.number(),
  prix_unitaire: z.coerce.number().default(0),
  reference: z.string().default(""),
  user_email: z.string().default(""),
  note: z.string().default(""),
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
