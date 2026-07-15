import type { Produit, ModeVente } from "./types";

/* ============================================================
   FRACTIONNEMENT — vendre à la boîte ou à l'unité
   ============================================================

   L'INVARIANT, à ne jamais enfreindre : les quantités de mouvement, le
   seuil `stock_min` et le stock qui en découle sont TOUS exprimés dans
   l'unité de base du produit. Jamais en boîtes, jamais dans un mélange.

   `facteur_conversion` = nombre d'unités de base par boîte.
   Un produit est fractionnable SSI facteur_conversion > 1.

   Quand le facteur vaut 1 — le cas des 65 produits existants — l'unité de
   base EST la boîte : tout le code ci-dessous devient une identité, et
   l'historique garde son sens exact sans une ligne réécrite.

   ── POURQUOI stock_min EST AUSSI EN UNITÉS DE BASE ─────────────────────
   Le seuil aurait pu rester en boîtes (c'est plus lisible pour l'humain),
   mais alors CHAQUE comparaison `stock <= stock_min` du code devrait
   penser à convertir — et TypeScript ne verrait jamais l'oubli (number
   contre number). Une unité unique rend ces comparaisons justes par
   construction.
   Bénéfice décisif : quand un fournisseur passe de 30 à 60 comprimés par
   boîte, l'unité de base ne change pas — le comprimé reste le comprimé.
   600 restent 600, le seuil de 150 comprimés reste 150 comprimés. Avec un
   seuil en boîtes, « 5 boîtes » aurait silencieusement doublé de sens.
*/

/** Un produit est fractionnable si, et seulement si, une boîte contient
 *  plus d'une unité de base. */
export function estFractionnable(p: Pick<Produit, "facteur_conversion">): boolean {
  return p.facteur_conversion > 1;
}

/** Facteur sûr : jamais 0, jamais négatif — utilisable en diviseur. */
export function facteur(p: Pick<Produit, "facteur_conversion">): number {
  return p.facteur_conversion >= 1 ? p.facteur_conversion : 1;
}

/**
 * Convertit une quantité SAISIE (dans l'unité du mode choisi) vers les
 * unités de base à sortir du stock.
 *
 * C'est LA fonction qui doit être appelée côté serveur, jamais côté
 * navigateur : la quantité déduite du stock ne se négocie pas avec le
 * client. (C'est précisément la dette relevée dans l'app d'Eugenio, où
 * `qte_stock_deduire` était calculé à l'écran et gobé tel quel.)
 */
export function versUnitesBase(
  p: Pick<Produit, "facteur_conversion">,
  quantite: number,
  mode: ModeVente,
): number {
  return mode === "detail" ? quantite : quantite * facteur(p);
}

/** Prix unitaire de comptoir selon le mode. Toujours lu au catalogue. */
export function prixPour(
  p: Pick<Produit, "prix_vente" | "prix_vente_detail">,
  mode: ModeVente,
): number {
  return mode === "detail" ? p.prix_vente_detail : p.prix_vente;
}

/**
 * Ventile un stock en unités de base en boîtes pleines + appoint.
 *
 * `Math.trunc` et non `Math.floor` : sur un stock négatif (possible en
 * append-only, deux caisses simultanées), floor(-23/10) donnerait
 * « -3 boîtes + 7 unités », ce qui ne veut rien dire. trunc donne
 * « -2 boîtes, -3 unités » — lisible et cohérent.
 */
export function ventiler(
  p: Pick<Produit, "facteur_conversion">,
  stockBase: number,
): { boites: number; appoint: number } {
  const f = facteur(p);
  return { boites: Math.trunc(stockBase / f), appoint: stockBase % f };
}

/**
 * Stock exprimé en boîtes, décimales comprises (2,5 boîtes).
 * Pour l'AFFICHAGE et les comparaisons humaines uniquement — jamais pour
 * décider d'une sortie de stock.
 */
export function enBoites(
  p: Pick<Produit, "facteur_conversion">,
  stockBase: number,
): number {
  return stockBase / facteur(p);
}

/**
 * Prix d'une unité de base au prorata du prix de la boîte.
 *
 * Sert UNIQUEMENT à valoriser le stock. À ne pas confondre avec
 * `prix_vente_detail`, qui est le prix de comptoir fixé par le pharmacien :
 * les deux diffèrent (vendre à l'unité se paie plus cher), et c'est voulu.
 */
export function prixParUniteBase(
  p: Pick<Produit, "prix_vente" | "facteur_conversion">,
): number {
  return p.prix_vente / facteur(p);
}

/**
 * Prix de détail suggéré à partir du prix de la boîte.
 * L'Ariary n'a pas de décimales : on arrondit à l'entier.
 * Simple proposition — le pharmacien reste maître de son tarif.
 */
export function prixDetailSuggere(prixVente: number, facteurConversion: number): number {
  if (!(facteurConversion > 1) || !(prixVente > 0)) return 0;
  return Math.round(prixVente / facteurConversion);
}

/**
 * Formate une quantité en unités de base pour l'œil humain.
 * Non fractionnable → « 12 ». Fractionnable → « 2 bte + 5 comprimés ».
 */
export function formaterQuantite(
  p: Pick<Produit, "facteur_conversion" | "unite_detail">,
  stockBase: number,
): string {
  if (!estFractionnable(p)) return String(stockBase);
  const unite = p.unite_detail || "unité";
  const avecUnite = (n: number) => `${n} ${unite}${Math.abs(n) > 1 ? "s" : ""}`;

  // Un stock négatif est une anomalie (deux caisses simultanées, ajustement
  // en retard). Le ventiler donnerait « -2 bte + -8 comprimés » : illisible.
  // On affiche la quantité brute, qui dit la vérité sans prétendre ranger
  // en boîtes ce qui n'existe pas.
  if (stockBase < 0) return avecUnite(stockBase);

  const { boites, appoint } = ventiler(p, stockBase);
  if (boites === 0) return avecUnite(appoint);
  const partBoites = `${boites} bte${boites > 1 ? "s" : ""}`;
  return appoint === 0 ? partBoites : `${partBoites} + ${avecUnite(appoint)}`;
}
