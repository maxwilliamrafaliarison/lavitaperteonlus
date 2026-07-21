import {
  listVentes,
  listLignesVente,
  listProduitsAvecStock,
  listAchats,
  listParametres,
} from "../sheets";
import { prixParUniteBase, facteur, formaterQuantite } from "../fractionnement";
import { fmtAriary } from "@/lib/reports/theme";
import type { ProduitAvecStock } from "../types";

/* ============================================================
   BILAN MENSUEL DE LA PHARMACIE — agrégation des données
   ============================================================

   Croise les référentiels de gestion officinale (CA, marge, rotation,
   panier moyen) et de pharmacie de médicaments essentiels OMS/MSH
   (couverture de stock, taux de rupture, gestion des péremptions).

   Choix de robustesse : les indicateurs de VALEUR (CA, marge, top
   produits) reposent sur les montants des lignes — fiables même pour les
   ventes reprises du cahier. La marge est estimée par le ratio
   prix_achat/prix_vente du produit (identique à la boîte ou à l'unité),
   ce qui la rend insensible à l'ambiguïté unité/boîte des reprises.
   ============================================================ */

export interface KpiLigne {
  label: string;
  valeur: string;
  hint?: string;
}
export interface LigneTop {
  nom: string;
  ca: number;
  part: number;
}
export interface LigneClasse {
  classe: string;
  ca: number;
  part: number;
}
export interface LigneFournisseur {
  fournisseur: string;
  montant: number;
  nb: number;
}
export interface LigneAlerte {
  designation: string;
  detail: string;
}
export interface LigneCommande {
  designation: string;
  fournisseur: string;
  stock: string;
  seuil: string;
  aCommander: string;
}
export interface LigneExp {
  designation: string;
  peremption: string;
  jours: number | null;
  perime: boolean;
}
export interface LignePec {
  entite: string;
  valeur: number;
  nb: number;
}
export interface LigneFiche {
  designation: string;
  classe: string;
  caSorties: number;
  stockLabel: string;
  valeurStock: number;
}

export interface BilanData {
  from: string;
  to: string;
  moisLabel: string;
  // Activité
  nbVentes: number;
  nbCash: number;
  nbPec: number;
  caComptant: number;
  valeurPec: number;
  panierMoyen: number;
  // Marge (estimée)
  coutVentes: number;
  margeBrute: number;
  tauxMarge: number;
  // Stock
  nbReferences: number;
  valeurStockVente: number;
  valeurStockAchat: number;
  nbRuptures: number;
  nbACommander: number;
  couvertureMois: number | null;
  rotationAnnuelle: number | null;
  // Détails
  topProduits: LigneTop[];
  parClasse: LigneClasse[];
  entreesMois: number;
  entreesParFournisseur: LigneFournisseur[];
  ruptures: LigneAlerte[];
  aCommander: LigneCommande[];
  perimes: LigneExp[];
  bientot: LigneExp[];
  pecParEntite: LignePec[];
  fiche: LigneFiche[];
}

const moisFr = (from: string) => {
  const [a, m] = from.split("-");
  const noms = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  return `${noms[Number(m) - 1] ?? m} ${a}`;
};

export async function buildBilanMensuel(from: string, to: string): Promise<BilanData> {
  const [ventes, lignes, produits, achats] = await Promise.all([
    listVentes(),
    listLignesVente(),
    listProduitsAvecStock(),
    listAchats(),
  ]);
  await listParametres().catch(() => new Map());

  const toFin = `${to}T23:59:59.999Z`;
  const dansMois = (ts: string) => ts >= from && ts <= toFin;

  const parId = new Map(produits.map((p) => [p.id, p]));
  const actifs = produits.filter((p) => p.statut === "actif");

  // ── Ventes du mois (hors annulées) ────────────────────────────────────────
  const vMois = ventes.filter((v) => dansMois(v.timestamp) && v.statut !== "annulee");
  const cash = vMois.filter((v) => v.typeVente !== "pec");
  const pec = vMois.filter((v) => v.typeVente === "pec");
  const caComptant = cash.reduce((s, v) => s + v.total, 0);
  const valeurPec = pec.reduce((s, v) => s + v.valeurPec, 0);
  const panierMoyen = cash.length > 0 ? caComptant / cash.length : 0;

  // ── Lignes des ventes du mois → CA, coût (marge), top, classes ─────────────
  const idsMois = new Set(vMois.map((v) => v.id));
  const idsPec = new Set(pec.map((v) => v.id));
  const parProduit = new Map<string, { ca: number; qte: number }>();
  const parClasseMap = new Map<string, number>();
  let coutVentes = 0;
  let caLignes = 0; // CA des lignes (comptant uniquement, pour la marge)
  for (const l of lignes) {
    if (!idsMois.has(l.venteId)) continue;
    const p = parId.get(l.produitId);
    // Top produits & classes : sur toutes les ventes (comptant + PEC dispensées).
    const agg = parProduit.get(l.produitId) ?? { ca: 0, qte: 0 };
    agg.ca += l.sousTotal;
    agg.qte += l.quantite;
    parProduit.set(l.produitId, agg);
    const cl = (p?.classe || "Non classé").trim() || "Non classé";
    parClasseMap.set(cl, (parClasseMap.get(cl) ?? 0) + l.sousTotal);
    // Marge : uniquement sur le comptant (le PEC n'est pas facturé).
    if (!idsPec.has(l.venteId) && p && p.prix_vente > 0) {
      caLignes += l.sousTotal;
      coutVentes += l.sousTotal * (p.prix_achat / p.prix_vente);
    }
  }
  const margeBrute = caLignes - coutVentes;
  const tauxMarge = caLignes > 0 ? (margeBrute / caLignes) * 100 : 0;

  const caTotalProduits = [...parProduit.values()].reduce((s, a) => s + a.ca, 0) || 1;
  const topProduits: LigneTop[] = [...parProduit.entries()]
    .map(([id, a]) => ({ nom: parId.get(id)?.designation ?? id, ca: a.ca, qte: a.qte, part: (a.ca / caTotalProduits) * 100 }))
    .sort((a, b) => b.ca - a.ca)
    .slice(0, 10);
  const caTotalClasses = [...parClasseMap.values()].reduce((s, v) => s + v, 0) || 1;
  const parClasse: LigneClasse[] = [...parClasseMap.entries()]
    .map(([classe, ca]) => ({ classe, ca, part: (ca / caTotalClasses) * 100 }))
    .sort((a, b) => b.ca - a.ca);

  // ── Stock ──────────────────────────────────────────────────────────────────
  const valeurStockVente = actifs.reduce((s, p) => s + p.stockBase * prixParUniteBase(p), 0);
  const valeurStockAchat = actifs.reduce((s, p) => s + p.stockBase * (p.prix_achat / facteur(p)), 0);
  const ruptureProds = actifs.filter((p) => p.stockBase <= 0);
  const aCommanderProds = actifs.filter((p) => p.stock_min > 0 && p.stockBase <= p.stock_min);
  const perimesProds = actifs
    .filter((p) => p.joursAvantPeremption !== null && p.joursAvantPeremption < 0)
    .sort((a, b) => (a.joursAvantPeremption ?? 0) - (b.joursAvantPeremption ?? 0));
  const bientotProds = actifs
    .filter((p) => (p.joursAvantPeremption ?? 999) >= 0 && (p.joursAvantPeremption ?? 999) <= 90)
    .sort((a, b) => (a.joursAvantPeremption ?? 0) - (b.joursAvantPeremption ?? 0));

  // Couverture (mois de stock) & rotation annualisée — estimations : valeur du
  // stock rapportée au coût des ventes du mois (extrapolé sur 12 mois).
  const couvertureMois = coutVentes > 0 ? valeurStockAchat / coutVentes : null;
  const rotationAnnuelle = valeurStockAchat > 0 ? (coutVentes * 12) / valeurStockAchat : null;

  // ── Entrées du mois (registre des achats) ──────────────────────────────────
  const aMois = achats.filter((a) => dansMois(a.timestamp || `${a.date_facture}T08:00:00.000Z`));
  const entreesMois = aMois.reduce((s, a) => s + a.montant_total, 0);
  const fournMap = new Map<string, { montant: number; nb: number }>();
  for (const a of aMois) {
    const f = a.fournisseur || "—";
    const agg = fournMap.get(f) ?? { montant: 0, nb: 0 };
    agg.montant += a.montant_total;
    agg.nb += 1;
    fournMap.set(f, agg);
  }
  const entreesParFournisseur: LigneFournisseur[] = [...fournMap.entries()]
    .map(([fournisseur, a]) => ({ fournisseur, ...a }))
    .sort((a, b) => b.montant - a.montant);

  // ── PEC par entité ──────────────────────────────────────────────────────────
  const pecMap = new Map<string, { valeur: number; nb: number }>();
  for (const v of pec) {
    const e = v.pecPayeur || "—";
    const agg = pecMap.get(e) ?? { valeur: 0, nb: 0 };
    agg.valeur += v.valeurPec;
    agg.nb += 1;
    pecMap.set(e, agg);
  }
  const pecParEntite: LignePec[] = [...pecMap.entries()]
    .map(([entite, a]) => ({ entite, ...a }))
    .sort((a, b) => b.valeur - a.valeur);

  // ── Fiche par produit (annexe) : CA des sorties du mois + stock actuel ──────
  const fiche: LigneFiche[] = actifs
    .map((p) => {
      const agg = parProduit.get(p.id);
      return {
        designation: p.designation,
        classe: (p.classe || "—").trim() || "—",
        caSorties: agg?.ca ?? 0,
        stockLabel: formaterQuantite(p, p.stockBase),
        valeurStock: p.stockBase * prixParUniteBase(p),
      };
    })
    .sort((a, b) => b.caSorties - a.caSorties || a.designation.localeCompare(b.designation));

  return {
    from,
    to,
    moisLabel: moisFr(from),
    nbVentes: vMois.length,
    nbCash: cash.length,
    nbPec: pec.length,
    caComptant,
    valeurPec,
    panierMoyen,
    coutVentes,
    margeBrute,
    tauxMarge,
    nbReferences: actifs.length,
    valeurStockVente,
    valeurStockAchat,
    nbRuptures: ruptureProds.length,
    nbACommander: aCommanderProds.length,
    couvertureMois,
    rotationAnnuelle,
    topProduits,
    parClasse,
    entreesMois,
    entreesParFournisseur,
    ruptures: ruptureProds.map((p) => ({ designation: p.designation, detail: p.fournisseur || "—" })),
    aCommander: aCommanderProds
      .sort((a, b) => (a.fournisseur || "￿").localeCompare(b.fournisseur || "￿") || a.designation.localeCompare(b.designation))
      .map((p) => ({
        designation: p.designation,
        fournisseur: p.fournisseur || "—",
        stock: formaterQuantite(p, p.stockBase),
        seuil: formaterQuantite(p, p.stock_min),
        aCommander: formaterQuantite(p, Math.max(0, Math.ceil(p.stock_min - p.stockBase))),
      })),
    perimes: perimesProds.map(ligneExp),
    bientot: bientotProds.map(ligneExp),
    pecParEntite,
    fiche,
  };
}

function ligneExp(p: ProduitAvecStock): LigneExp {
  return {
    designation: p.designation,
    peremption: p.prochainePeremption ?? "—",
    jours: p.joursAvantPeremption,
    perime: (p.joursAvantPeremption ?? 0) < 0,
  };
}

/** KPIs du tableau de bord, prêts pour la grille du PDF. */
export function bilanKpis(d: BilanData): KpiLigne[] {
  return [
    { label: "Chiffre d'affaires (comptant)", valeur: fmtAriary(d.caComptant), hint: `${d.nbCash} ventes` },
    { label: "Panier moyen", valeur: fmtAriary(d.panierMoyen) },
    { label: "Marge brute estimée", valeur: fmtAriary(d.margeBrute), hint: `${d.tauxMarge.toFixed(1)} % du CA` },
    { label: "Prises en charge", valeur: fmtAriary(d.valeurPec), hint: `${d.nbPec} PEC` },
    { label: "Valeur du stock (vente)", valeur: fmtAriary(d.valeurStockVente), hint: `${d.nbReferences} références` },
    { label: "Ruptures / à commander", valeur: `${d.nbRuptures} / ${d.nbACommander}` },
    { label: "Couverture de stock", valeur: d.couvertureMois !== null ? `${d.couvertureMois.toFixed(1)} mois` : "—", hint: "estimation" },
    { label: "Rotation annualisée", valeur: d.rotationAnnuelle !== null ? `${d.rotationAnnuelle.toFixed(1)} ×/an` : "—", hint: "estimation" },
  ];
}
