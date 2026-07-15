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
import { getT, isLang } from "@/lib/i18n";

const LigneInput = z.object({
  produitId: z.string().min(1),
  quantite: z.number().int().positive(),
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
    if (produit.stockBase < ligne.quantite) {
      return {
        ok: false,
        error: t("pharmacie.vente_error_stock", {
          p: produit.designation,
          stock: produit.stockBase,
        }),
      };
    }
    // Garde-fou prix : un produit sans prix de vente serait encaissé à 0 Ar.
    // 31 des 65 produits étaient dans ce cas (prix absents de l'inventaire
    // Excel d'origine) — la caisse refuse plutôt que d'offrir la marchandise.
    if (!produit.prix_vente || produit.prix_vente <= 0) {
      return {
        ok: false,
        error: t("pharmacie.vente_error_sans_prix", { p: produit.designation }),
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

  // Le prix facturé vient TOUJOURS du catalogue, jamais du navigateur : un
  // client modifié ou une page restée ouverte pendant un changement de tarif
  // ne peuvent pas décider du montant encaissé. La boucle de validation
  // ci-dessus garantit que chaque produit existe et a un prix > 0.
  const lignesTarifees = lignes.map((l) => {
    const prixUnitaire = parId.get(l.produitId)!.prix_vente;
    return { ...l, prixUnitaire, sousTotal: l.quantite * prixUnitaire };
  });
  const total = lignesTarifees.reduce((s, l) => s + l.sousTotal, 0);

  try {
    await enregistrerVente({
      venteRow: [venteId, timestamp, clientNom, "cash", total, email, "active"],
      lignesRows: lignesTarifees.map((l, i) => [
        `${venteId}-L${i + 1}`,
        venteId,
        l.produitId,
        lotPourProduit.get(l.produitId) ?? "",
        l.quantite,
        l.prixUnitaire,
        l.sousTotal,
      ]),
      mouvementsRows: lignesTarifees.map((l, i) => [
        `MVT-${venteId}-${i + 1}`,
        timestamp,
        l.produitId,
        lotPourProduit.get(l.produitId) ?? "",
        "vente",
        -l.quantite,
        l.prixUnitaire,
        venteId,
        email,
        clientNom ? `Vente à ${clientNom} (${heure})` : `Vente comptoir (${heure})`,
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
