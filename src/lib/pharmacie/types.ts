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

/**
 * Nombre d'unités de base par boîte. LE champ qui définit l'unité du stock.
 *
 * `z.coerce.number().default(1)` ne suffirait pas : `.default()` ne joue que
 * sur `undefined`, et `Number("")` vaut 0 — or une cellule vide de Sheets
 * arrive en `""`. On obtiendrait facteur 0, donc une division par zéro et
 * des `Infinity` dans les prix. Ce piège est propre à ce champ : sa valeur
 * neutre est 1, là où toutes les autres colonnes numériques ont 0.
 *
 * Ce lecteur ne peut jamais échouer, donc ne peut jamais faire tomber un
 * produit dans le filtre silencieux de listProduits().
 */
const FacteurConversion = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return 1;
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1;
}, z.number().int().min(1));

/** Unité dans laquelle une quantité est saisie ou vendue. */
export const ModeVente = z.enum(["boite", "detail"]);
export type ModeVente = z.infer<typeof ModeVente>;

const modeVente = () =>
  z.preprocess((v) => (v === "detail" ? "detail" : "boite"), ModeVente);

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
  // --- Fractionnement (migration 005) ---
  // Le produit est fractionnable SSI facteur_conversion > 1. Aucun drapeau
  // séparé : l'unité du stock ne doit dépendre QUE de ce nombre, jamais
  // d'un prix ni d'un libellé — sinon vider prix_vente_detail
  // réinterpréterait 600 comprimés en 600 boîtes.
  facteur_conversion: FacteurConversion,
  unite_detail: txt(),
  prix_vente_detail: z.coerce.number().default(0),
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
  // --- Fractionnement (migration 005) : AUDIT ET AFFICHAGE SEULEMENT ---
  // Ce qui a été saisi à l'écran, pour que le kardex reste vrai après un
  // changement de facteur (« 10 boîtes reçues » reste exact pour son époque).
  // `quantite` demeure la SEULE source du stock, toujours en unités de base :
  // se servir de ces deux colonnes dans un calcul de stock recréerait la
  // dette relevée chez Eugenio.
  unite_saisie: modeVente(),
  facteur_applique: FacteurConversion,
});
export type Mouvement = z.infer<typeof Mouvement>;

/** Produit enrichi du stock calculé et de la péremption la plus proche. */
export interface ProduitAvecStock extends Produit {
  /**
   * Stock en UNITÉS DE BASE : des comprimés si le produit est fractionnable
   * (facteur_conversion > 1), des boîtes sinon.
   *
   * RENOMMÉ depuis `stock` VOLONTAIREMENT. Le nom neutre invitait à écrire
   * `p.stock * p.prix_vente` — juste tant que tout valait des boîtes, faux
   * d'un facteur 30 dès qu'un produit est fractionné, et invisible pour le
   * compilateur (number × number). Le renommage transforme chaque site en
   * erreur de compilation, donc en décision consciente.
   *
   * Pour l'affichage, passer par formaterQuantite() ou enBoites()
   * (src/lib/pharmacie/fractionnement.ts) — jamais afficher ce nombre brut
   * sur un produit fractionnable.
   */
  stockBase: number;
  prochainePeremption: string | null;
  /** jours restants avant péremption (négatif = périmé) */
  joursAvantPeremption: number | null;
}

export const STATUT_LABELS: Record<ProduitStatut, { fr: string; it: string }> = {
  actif: { fr: "Actif", it: "Attivo" },
  a_detruire: { fr: "À détruire", it: "Da distruggere" },
  archive: { fr: "Archivé", it: "Archiviato" },
};
