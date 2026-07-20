"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  enregistrerVente,
  listProduitsAvecStock,
  listStockParLot,
} from "@/lib/pharmacie/sheets";
import { ModeVente } from "@/lib/pharmacie/types";
import {
  estFractionnable,
  facteur,
  prixPour,
  versUnitesBase,
  formaterQuantite,
} from "@/lib/pharmacie/fractionnement";
import { allouer } from "@/lib/pharmacie/fefo";
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

  // On lit l'état courant du catalogue (pour valider produit, statut, prix).
  // Le stock ventilé par lot est lu juste avant l'allocation FEFO.
  const produits = await listProduitsAvecStock();
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

  const venteId = genId("VTE");
  const timestamp = new Date().toISOString();
  const heure = timestamp.slice(11, 19);
  const email = session.user.email ?? "";
  const libelle = clientNom ? `Vente à ${clientNom} (${heure})` : `Vente comptoir (${heure})`;

  // Stock ventilé par lot, MUTABLE entre les lignes : le FEFO d'une ligne voit
  // déjà ce que les lignes précédentes ont consommé (invariant I6).
  const stockParLot = await listStockParLot();

  // Répartition FEFO, ligne par ligne. L'ÉCHEC de l'allocation EST le contrôle
  // de stock : on refuse si l'ensemble des lots ne couvre pas le besoin,
  // jamais un lot testé isolément. Le prix ET la quantité déduite viennent
  // TOUJOURS du catalogue, jamais du navigateur (dette d'Eugenio évitée).
  const mouvementsRows: unknown[][] = [];
  const lignesRows: unknown[][] = [];
  let nMvt = 0;
  let total = 0;

  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    const produit = parId.get(ligne.produitId)!;
    const prixUnitaire = prixPour(produit, ligne.mode);
    const sousTotal = ligne.quantite * prixUnitaire;
    const besoinBase = versUnitesBase(produit, ligne.quantite, ligne.mode);
    const f = facteur(produit);

    const buckets = stockParLot.get(ligne.produitId) ?? [];
    const res = allouer(f, besoinBase, ligne.mode, buckets);
    if (!res.ok) {
      const dispo = buckets.reduce((s, b) => s + b.gros + b.detail, 0);
      return {
        ok: false,
        error: t("pharmacie.vente_error_stock", {
          p: produit.designation,
          stock: formaterQuantite(produit, dispo),
        }),
      };
    }
    total += sousTotal;

    const note =
      ligne.mode === "detail"
        ? `${libelle} — ${ligne.quantite} ${produit.unite_detail || "unité"}`
        : libelle;

    // Ouverture d'une boîte = 2 mouvements 'transfert' (net nul sur le produit) :
    // −q en GROS, +q en DÉTAIL du même lot, la péremption est conservée.
    for (const o of res.ouvertures) {
      mouvementsRows.push([`MVT-${venteId}-${++nMvt}`, timestamp, ligne.produitId, o.lotId, "transfert", -o.quantite, 0, venteId, email, `Ouverture boîte (${venteId})`, ligne.mode, f, "gros"]);
      mouvementsRows.push([`MVT-${venteId}-${++nMvt}`, timestamp, ligne.produitId, o.lotId, "transfert", o.quantite, 0, venteId, email, `Ouverture boîte (${venteId})`, ligne.mode, f, "detail"]);
    }
    // Sorties de vente : un mouvement négatif par (lot, compartiment) alloué.
    for (const a of res.allocations) {
      mouvementsRows.push([`MVT-${venteId}-${++nMvt}`, timestamp, ligne.produitId, a.lotId, "vente", -a.quantite, prixUnitaire, venteId, email, note, ligne.mode, f, a.compartiment]);
    }

    // Ligne de vente : quantité dans l'unité DU MODE (ce que le ticket montre) ;
    // lot affiché = premier lot alloué ; qte_stock_deduire = besoin en base.
    lignesRows.push([`${venteId}-L${i + 1}`, venteId, ligne.produitId, res.allocations[0]?.lotId ?? "", ligne.quantite, prixUnitaire, sousTotal, ligne.mode, besoinBase]);
  }

  try {
    await enregistrerVente({
      // pec_payeur='' et valeur_pec=0 : vente cash (la PEC arrive en T6).
      venteRow: [venteId, timestamp, clientNom, "cash", total, email, "active", "", 0],
      lignesRows,
      mouvementsRows,
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
