import { listProduitsAvecStock, listVentes, type VenteResume } from "../sheets";
import { formaterQuantite, prixParUniteBase } from "../fractionnement";
import { fmtAriary } from "@/lib/reports/theme";
import type { ProduitAvecStock } from "../types";

/* ============================================================
   PHARMACIE — Données des rapports manuels
   Cinq rapports, une source unique (mêmes fonctions que l'appli, donc
   même stock que l'écran). Les libellés de quantité sont pré-formatés ici
   (formaterQuantite a besoin du produit) pour garder les templates PDF
   simples et sans dépendance au fractionnement.
   ============================================================ */

export type PharmaRapportType =
  | "ventes"
  | "stock"
  | "a_commander"
  | "expiration"
  | "rupture";

export const PHARMA_RAPPORTS: PharmaRapportType[] = [
  "ventes",
  "stock",
  "a_commander",
  "expiration",
  "rupture",
];

export interface LigneVenteRapport {
  id: string;
  date: string;
  tiers: string; // client (cash) ou payeur (pec)
  articles: number;
  montant: number; // total encaissé (cash) ou valeur (pec)
}

export interface VentesData {
  type: "ventes";
  from: string;
  to: string;
  cash: LigneVenteRapport[];
  pec: LigneVenteRapport[];
  totalCash: number;
  valeurPec: number;
}

export interface LigneStock {
  designation: string;
  fournisseur: string;
  stock: string;
  seuil: string;
  prixUnite: string;
  valeur: number;
  valeurLabel: string;
}
export interface StockData {
  type: "stock";
  lignes: LigneStock[];
  valeurTotale: number;
  nbProduits: number;
}

export interface LigneCommande {
  designation: string;
  fournisseur: string;
  stock: string;
  seuil: string;
  aCommander: string;
}
export interface CommandeData {
  type: "a_commander";
  lignes: LigneCommande[];
}

export interface LigneExpiration {
  designation: string;
  peremption: string;
  jours: number | null;
  stock: string;
  perime: boolean;
}
export interface ExpirationData {
  type: "expiration";
  perimes: LigneExpiration[];
  bientot: LigneExpiration[];
}

export interface LigneRupture {
  designation: string;
  fournisseur: string;
  seuil: string;
}
export interface RuptureData {
  type: "rupture";
  lignes: LigneRupture[];
}

export type RapportData =
  | VentesData
  | StockData
  | CommandeData
  | ExpirationData
  | RuptureData;

const parFournisseurPuisNom = (a: ProduitAvecStock, b: ProduitAvecStock) =>
  (a.fournisseur || "￿").localeCompare(b.fournisseur || "￿") ||
  a.designation.localeCompare(b.designation);

function mapVente(v: VenteResume, pec: boolean): LigneVenteRapport {
  return {
    id: v.id,
    date: v.timestamp,
    tiers: pec ? v.pecPayeur || "—" : v.clientNom || "—",
    articles: v.nbArticles,
    montant: pec ? v.valeurPec : v.total,
  };
}

/**
 * Construit les données d'un rapport. La période ne concerne que le rapport
 * des ventes ; les autres photographient l'état courant du stock.
 */
export async function buildRapportData(
  type: PharmaRapportType,
  opts: { from?: string; to?: string } = {},
): Promise<RapportData> {
  if (type === "ventes") {
    const ventes = await listVentes();
    const from = opts.from ?? "";
    const to = opts.to ?? "";
    // Bornes inclusives sur la date (comparaison lexicale ISO). `to` est
    // étendu à la fin de journée pour inclure toute la journée choisie.
    const toFin = to ? `${to}T23:59:59.999Z` : "";
    const dansPeriode = ventes.filter((v) => {
      if (v.statut === "annulee") return false;
      if (from && v.timestamp < from) return false;
      if (toFin && v.timestamp > toFin) return false;
      return true;
    });
    const cash = dansPeriode.filter((v) => v.typeVente !== "pec");
    const pec = dansPeriode.filter((v) => v.typeVente === "pec");
    return {
      type: "ventes",
      from,
      to,
      cash: cash.map((v) => mapVente(v, false)),
      pec: pec.map((v) => mapVente(v, true)),
      totalCash: cash.reduce((s, v) => s + v.total, 0),
      valeurPec: pec.reduce((s, v) => s + v.valeurPec, 0),
    };
  }

  const produits = (await listProduitsAvecStock()).filter(
    (p) => p.statut === "actif",
  );

  if (type === "stock") {
    const lignes = produits
      .slice()
      .sort((a, b) => a.designation.localeCompare(b.designation))
      .map((p) => {
        const valeur = p.stockBase * prixParUniteBase(p);
        return {
          designation: p.designation,
          fournisseur: p.fournisseur || "—",
          stock: formaterQuantite(p, p.stockBase),
          seuil: p.stock_min > 0 ? formaterQuantite(p, p.stock_min) : "—",
          prixUnite: fmtAriary(prixParUniteBase(p)),
          valeur,
          valeurLabel: fmtAriary(valeur),
        };
      });
    return {
      type: "stock",
      lignes,
      valeurTotale: lignes.reduce((s, l) => s + l.valeur, 0),
      nbProduits: lignes.length,
    };
  }

  if (type === "a_commander") {
    const lignes = produits
      .filter((p) => p.stock_min > 0 && p.stockBase <= p.stock_min)
      .sort(parFournisseurPuisNom)
      .map((p) => ({
        designation: p.designation,
        fournisseur: p.fournisseur || "—",
        stock: formaterQuantite(p, p.stockBase),
        seuil: formaterQuantite(p, p.stock_min),
        aCommander: formaterQuantite(
          p,
          Math.max(0, Math.ceil(p.stock_min - p.stockBase)),
        ),
      }));
    return { type: "a_commander", lignes };
  }

  if (type === "expiration") {
    const avecDate = produits.filter((p) => p.joursAvantPeremption !== null);
    const perimes = avecDate
      .filter((p) => (p.joursAvantPeremption ?? 0) < 0)
      .sort((a, b) => (a.joursAvantPeremption ?? 0) - (b.joursAvantPeremption ?? 0))
      .map((p) => ligneExp(p, true));
    const bientot = avecDate
      .filter(
        (p) =>
          (p.joursAvantPeremption ?? 999) >= 0 &&
          (p.joursAvantPeremption ?? 999) <= 90,
      )
      .sort((a, b) => (a.joursAvantPeremption ?? 0) - (b.joursAvantPeremption ?? 0))
      .map((p) => ligneExp(p, false));
    return { type: "expiration", perimes, bientot };
  }

  // rupture : stock épuisé (produits actifs à 0 ou moins).
  const lignes = produits
    .filter((p) => p.stockBase <= 0)
    .sort(parFournisseurPuisNom)
    .map((p) => ({
      designation: p.designation,
      fournisseur: p.fournisseur || "—",
      seuil: p.stock_min > 0 ? formaterQuantite(p, p.stock_min) : "—",
    }));
  return { type: "rupture", lignes };
}

function ligneExp(p: ProduitAvecStock, perime: boolean): LigneExpiration {
  return {
    designation: p.designation,
    peremption: p.prochainePeremption ?? "—",
    jours: p.joursAvantPeremption,
    stock: formaterQuantite(p, p.stockBase),
    perime,
  };
}
