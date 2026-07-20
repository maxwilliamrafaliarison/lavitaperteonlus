import type { Compartiment, ModeVente, StockLot } from "./types";

/* ============================================================
   FEFO — First Expired First Out
   ============================================================

   Décide QUELS lots (et quel compartiment) servent une vente, dans l'ordre
   de péremption. Module PUR : aucune base de données, aucun effet de bord
   réseau — d'où sa testabilité. Le résultat est traduit en mouvements
   append-only par l'appelant (la vente).

   Règles physiques (invariants I4/I5) :
   - GROS = boîtes fermées, DÉTAIL = unités ouvertes.
   - On ne vend à l'unité QUE depuis DÉTAIL ; couvrir un manque exige
     d'OUVRIR une boîte (transfert GROS → DÉTAIL du même lot).
   - On ne vend à la boîte QUE depuis GROS.
   - L'échec de l'allocation EST le contrôle de stock : on refuse si
     l'ensemble des lots ne couvre pas le besoin, jamais un lot testé seul.
*/

/** Une sortie de stock : `quantite` unités de base prises sur (lot, compartiment). */
export interface Allocation {
  lotId: string;
  compartiment: Compartiment;
  quantite: number;
}

/** Une ouverture de boîte : `quantite` unités déplacées GROS → DÉTAIL du lot. */
export interface OuvertureBoite {
  lotId: string;
  quantite: number;
}

export interface ResultatAllocation {
  ok: boolean;
  allocations: Allocation[];
  ouvertures: OuvertureBoite[];
}

/**
 * Ordre FEFO : péremption la plus proche d'abord, lots sans date en dernier,
 * départage déterministe par identifiant de lot (pour un résultat stable).
 */
export function cmpFEFO(a: StockLot, b: StockLot): number {
  const aVide = a.dateExpiration === "";
  const bVide = b.dateExpiration === "";
  if (aVide !== bVide) return aVide ? 1 : -1;
  if (!aVide && a.dateExpiration !== b.dateExpiration) {
    return a.dateExpiration < b.dateExpiration ? -1 : 1;
  }
  return a.lotId < b.lotId ? -1 : a.lotId > b.lotId ? 1 : 0;
}

/**
 * Alloue `besoinBase` unités de base d'un produit selon le FEFO.
 *
 * Sur SUCCÈS, MUTE les buckets passés (gros/detail décrémentés) : entre deux
 * lignes du même panier, le stock disponible reflète déjà la ligne
 * précédente (invariant I6). Sur ÉCHEC, ne mute rien — l'appelant refuse la
 * vente sans état à moitié consommé.
 *
 * @param facteur  unités de base par boîte (1 = produit non fractionnable)
 * @param mode     'boite' (sort du GROS) ou 'detail' (DÉTAIL puis ouverture)
 */
export function allouer(
  facteur: number,
  besoinBase: number,
  mode: ModeVente,
  buckets: StockLot[],
): ResultatAllocation {
  const ordre = [...buckets].sort(cmpFEFO);
  const allocations: Allocation[] = [];
  const ouvertures: OuvertureBoite[] = [];
  let reste = besoinBase;

  if (mode === "detail" && facteur > 1) {
    // 1. Épuiser le DÉTAIL déjà ouvert, dans l'ordre FEFO.
    for (const b of ordre) {
      if (reste <= 0) break;
      const pris = Math.min(b.detail, reste);
      if (pris > 0) {
        allocations.push({ lotId: b.lotId, compartiment: "detail", quantite: pris });
        reste -= pris;
      }
    }
    // 2. Ouvrir des boîtes du GROS pour le reliquat, FEFO.
    for (const b of ordre) {
      if (reste <= 0) break;
      const boitesDispo = Math.floor(b.gros / facteur);
      if (boitesDispo <= 0) continue;
      const boitesAOuvrir = Math.min(boitesDispo, Math.ceil(reste / facteur));
      const baseOuverte = boitesAOuvrir * facteur;
      ouvertures.push({ lotId: b.lotId, quantite: baseOuverte });
      // Les unités fraîchement ouvertes se vendent depuis le DÉTAIL du lot ;
      // le reliquat (boîte entamée) reste sur l'étagère.
      const pris = Math.min(baseOuverte, reste);
      allocations.push({ lotId: b.lotId, compartiment: "detail", quantite: pris });
      reste -= pris;
    }
  } else {
    // Vente à la boîte (ou produit non fractionnable) : GROS uniquement, FEFO.
    for (const b of ordre) {
      if (reste <= 0) break;
      const pris = Math.min(b.gros, reste);
      if (pris > 0) {
        allocations.push({ lotId: b.lotId, compartiment: "gros", quantite: pris });
        reste -= pris;
      }
    }
  }

  // Épsilon : les quantités sont entières en pratique, la garde protège des
  // arrondis d'un éventuel produit exotique.
  if (reste > 1e-6) {
    return { ok: false, allocations: [], ouvertures: [] };
  }

  // Succès : on applique aux buckets réels (les objets partagés avec l'appelant).
  const parLot = new Map(buckets.map((b) => [b.lotId, b]));
  for (const o of ouvertures) {
    const b = parLot.get(o.lotId)!;
    b.gros -= o.quantite;
    b.detail += o.quantite;
  }
  for (const a of allocations) {
    const b = parLot.get(a.lotId)!;
    if (a.compartiment === "detail") b.detail -= a.quantite;
    else b.gros -= a.quantite;
  }

  return { ok: true, allocations, ouvertures };
}
