"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  enregistrerVente,
  listProduitsAvecStock,
  listLots,
} from "@/lib/pharmacie/sheets";
import { ModeVente } from "@/lib/pharmacie/types";
import {
  estFractionnable,
  facteur,
  prixPour,
  versUnitesBase,
  formaterQuantite,
} from "@/lib/pharmacie/fractionnement";
import { getT, isLang } from "@/lib/i18n";

const LigneInput = z.object({
  produitId: z.string().min(1),
  /** Quantité dans l'unité DU MODE : des boîtes, ou des comprimés. */
  quantite: z.number().int().positive(),
  /** Vendu à la boîte ou à l'unité. Par défaut à la boîte. */
  mode: ModeVente.default("boite"),
  // Le prix envoyé par le navigateur n'est qu'INDICATIF (il sert à afficher
  // le panier). Le serveur le recalcule systématiquement depuis le catalogue :
  // ce qui arrive ici n'a aucun effet sur ce qui est facturé.
  prixUnitaire: z.number().nonnegative().optional(),
});

const VenteInput = z.object({
  clientNom: z.string().trim().max(120).default(""),
  lignes: z.array(LigneInput).min(1).max(50),
});

export type VenteResult =
  | { ok: true; venteId: string; total: number }
  | { ok: false; error: string };

function genId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

export async function creerVenteAction(raw: unknown): Promise<VenteResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  const lang = isLang(session.user.lang) ? session.user.lang : "fr";
  const t = getT(lang);

  if (!can(session.user.role, "pharmacie:vendre")) {
    return { ok: false, error: t("pharmacie.vente_error_forbidden") };
  }

  const parsed = VenteInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: t("pharmacie.vente_error_invalid") };
  }
  const { clientNom, lignes } = parsed.data;

  // Contrôle de stock best-effort : on lit l'état courant. L'append-only
  // garantit qu'aucune écriture concurrente n'est perdue ; au pire un
  // passage simultané rend un stock négatif, visible et ajustable.
  const [produits, lots] = await Promise.all([
    listProduitsAvecStock(),
    listLots(),
  ]);
  const parId = new Map(produits.map((p) => [p.id, p]));

  // Contrôles ligne par ligne : existence, statut, prix du mode choisi.
  for (const ligne of lignes) {
    const produit = parId.get(ligne.produitId);
    if (!produit) {
      return { ok: false, error: t("pharmacie.vente_error_produit") };
    }
    if (produit.statut !== "actif") {
      return {
        ok: false,
        error: t("pharmacie.vente_error_statut", { p: produit.designation }),
      };
    }
    // Vendre à l'unité un produit qui ne l'est pas convertirait des boîtes
    // en comprimés : 5 « unités » sortiraient 5 boîtes du stock.
    if (ligne.mode === "detail" && !estFractionnable(produit)) {
      return {
        ok: false,
        error: t("pharmacie.vente_error_pas_detail", { p: produit.designation }),
      };
    }
    // Garde-fou prix : sans tarif, la caisse encaisserait 0 Ar. Le prix
    // contrôlé est celui du MODE choisi — un produit peut avoir un prix à la
    // boîte sans avoir de prix à l'unité.
    if (prixPour(produit, ligne.mode) <= 0) {
      return {
        ok: false,
        error: t("pharmacie.vente_error_sans_prix", { p: produit.designation }),
      };
    }
  }

  // Contrôle de stock APRÈS agrégation par produit. Avec le fractionnement,
  // un même produit peut apparaître sur deux lignes (2 boîtes + 5 comprimés) :
  // les vérifier séparément laisserait passer un panier qui, au total, dépasse
  // le stock. On somme d'abord, en unités de base, puis on compare une fois.
  const besoinParProduit = new Map<string, number>();
  for (const ligne of lignes) {
    const produit = parId.get(ligne.produitId)!;
    const base = versUnitesBase(produit, ligne.quantite, ligne.mode);
    besoinParProduit.set(
      ligne.produitId,
      (besoinParProduit.get(ligne.produitId) ?? 0) + base,
    );
  }
  for (const [produitId, besoin] of besoinParProduit) {
    const produit = parId.get(produitId)!;
    if (produit.stockBase < besoin) {
      return {
        ok: false,
        error: t("pharmacie.vente_error_stock", {
          p: produit.designation,
          stock: formaterQuantite(produit, produit.stockBase),
        }),
      };
    }
  }

  // FEFO simplifié : lot à la péremption la plus proche pour chaque produit
  const lotPourProduit = new Map<string, string>();
  for (const lot of lots) {
    const current = lotPourProduit.get(lot.produit_id);
    if (!current) {
      lotPourProduit.set(lot.produit_id, lot.id);
      continue;
    }
    const currentLot = lots.find((l) => l.id === current);
    if (
      lot.date_expiration &&
      (!currentLot?.date_expiration ||
        lot.date_expiration < currentLot.date_expiration)
    ) {
      lotPourProduit.set(lot.produit_id, lot.id);
    }
  }

  const venteId = genId("VTE");
  const now = new Date();
  const timestamp = now.toISOString();
  const heure = timestamp.slice(11, 19);
  const email = session.user.email ?? "";

  // Le prix ET la quantité déduite viennent TOUJOURS du catalogue, jamais du
  // navigateur : une page restée ouverte pendant un changement de tarif, ou
  // un client modifié, ne décident ni du montant encaissé ni de ce qui sort
  // du stock. C'est précisément la dette relevée dans l'app d'Eugenio, où
  // `qte_stock_deduire` était calculé à l'écran et gobé tel quel.
  const lignesTarifees = lignes.map((l) => {
    const produit = parId.get(l.produitId)!;
    const prixUnitaire = prixPour(produit, l.mode);
    return {
      ...l,
      prixUnitaire,
      sousTotal: l.quantite * prixUnitaire,
      // Ce qui sort réellement du stock, en unités de base.
      qteBase: versUnitesBase(produit, l.quantite, l.mode),
      facteur: facteur(produit),
      unite: produit.unite_detail,
    };
  });
  const total = lignesTarifees.reduce((s, l) => s + l.sousTotal, 0);

  const libelle = clientNom ? `Vente à ${clientNom} (${heure})` : `Vente comptoir (${heure})`;

  try {
    await enregistrerVente({
      venteRow: [venteId, timestamp, clientNom, "cash", total, email, "active"],
      lignesRows: lignesTarifees.map((l, i) => [
        `${venteId}-L${i + 1}`,
        venteId,
        l.produitId,
        lotPourProduit.get(l.produitId) ?? "",
        // `quantite` reste dans l'unité DU MODE (2 = 2 boîtes ou 2 comprimés) :
        // c'est ce que le ticket doit montrer. `qte_stock_deduire` porte la
        // conversion. Les confondre fausserait l'un ou l'autre.
        l.quantite,
        l.prixUnitaire,
        l.sousTotal,
        l.mode,
        l.qteBase,
      ]),
      mouvementsRows: lignesTarifees.map((l, i) => [
        `MVT-${venteId}-${i + 1}`,
        timestamp,
        l.produitId,
        lotPourProduit.get(l.produitId) ?? "",
        "vente",
        // Le mouvement est TOUJOURS en unités de base : c'est l'invariant du
        // stock, et la somme des mouvements doit rester juste.
        -l.qteBase,
        l.prixUnitaire,
        venteId,
        email,
        l.mode === "detail"
          ? `${libelle} — ${l.quantite} ${l.unite || "unité"}`
          : libelle,
        // Audit seulement : ce qui a été saisi à l'écran, pour que le kardex
        // reste vrai même après un changement de facteur.
        l.mode,
        l.facteur,
      ]),
    });
  } catch (e) {
    return {
      ok: false,
      error: t("pharmacie.vente_error_write", { detail: String(e).slice(0, 120) }),
    };
  }

  revalidatePath("/pharmacie");
  revalidatePath("/pharmacie/vente");
  return { ok: true, venteId, total };
}
