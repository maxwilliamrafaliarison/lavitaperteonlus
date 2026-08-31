import { MENTION_DEVISE, type EntiteLegale } from "./entite";
import {
  bouton, chiffres, encadre, entete, enveloppe, esc, fmtAr as ar,
  lignes as releve, para, pied, section, tableau, titre, type Ton,
} from "./mail-modele";

/* ============================================================
   COMPTE RENDU DE FIN DE JOURNÉE — composition du document
   ============================================================

   Sorti de la route qui l'envoie, pour deux raisons. Il devient AFFICHABLE
   hors messagerie, donc vérifiable avant qu'un destinataire ne le reçoive :
   un document qu'on ne peut relire qu'en se l'envoyant se corrige toujours
   trop tard. Et il devient testable, ce qu'une route protégée par une
   session ne sera jamais.
   ============================================================ */

export interface ProduitRapport {
  designation: string;
  fournisseur?: string;
  prochainePeremption?: string | null;
  joursAvantPeremption?: number | null;
  stockAffiche: string;
  seuilAffiche: string;
  aCommander: string;
}

export interface DonneesRapport {
  entite: EntiteLegale;
  dateStr: string;
  apercu: boolean;
  destinataires: string[];
  caComptant: number;
  panierMoyen: number;
  valeurPec: number;
  nbVentes: number;
  nbVentesComptant: number;
  nbPec: number;
  ventes: Array<{ id: string; clientNom: string; nbArticles: number; total: number }>;
  topProduits: Array<{ nom: string; qte: number; ca: number }>;
  nbActifs: number;
  valeurStock: number;
  enRupture: number;
  perimes: ProduitRapport[];
  bientot: ProduitRapport[];
  stockBas: ProduitRapport[];
}

export function htmlRapportQuotidien(d: DonneesRapport): string {
  const {
    entite: entiteLegale, dateStr, apercu, destinataires,
    caComptant, panierMoyen, valeurPec, nbVentes, nbVentesComptant, nbPec,
    ventes, topProduits, nbActifs, valeurStock, enRupture,
    perimes, bientot, stockBas,
  } = d;
  const nbAlertes = perimes.length + bientot.length + stockBas.length;
  /* Le ton du bandeau vient de ce qui appelle une décision, non du chiffre
     d'affaires : une journée sans vente n'est pas une anomalie, un produit
     périmé en est une. */
  const tonAlertes: Ton = perimes.length > 0 ? "critique" : nbAlertes > 0 ? "vigilance" : "bon";
  return enveloppe(`
${entete(entiteLegale)}
${titre("Compte rendu de fin de journée · Pharmacie", `${dateStr} · Centre REX`)}
${
  apercu
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:14px 0 0;background:#FDF3E3;border-left:3px solid #B45309;border-radius:0 3px 3px 0"><tr><td style="padding:11px 14px;font-size:12px;color:#3F4651">
        <strong>Aperçu</strong> : ce courriel n'est parti qu'à vous. En fin de journée, il est adressé à ${esc(destinataires.join(", "))}.
      </td></tr></table>`
    : ""
}

${chiffres([
  { etiquette: "Recettes du jour", valeur: ar(caComptant) },
  { etiquette: "Ventes", valeur: String(nbVentes), detail: nbVentesComptant > 0 ? `panier moyen ${ar(panierMoyen)}` : undefined },
  { etiquette: "Alertes", valeur: String(nbAlertes), ton: tonAlertes },
])}

${section("Activité")}
${releve([
  ["Recettes comptant", ar(caComptant)],
  [`Ventes comptant (${nbVentesComptant})`, nbVentesComptant > 0 ? `panier moyen ${ar(panierMoyen)}` : "—"],
  [`Prises en charge (${nbPec})`, `valeur ${ar(valeurPec)}, non encaissée`],
  ["Total des ventes", String(nbVentes), { fort: true, trait: true }],
])}

${
  topProduits.length === 0
    ? ""
    : section("Produits les plus dispensés") +
      tableau(
        ["Produit", "Quantité", "Recettes"],
        topProduits.map((p) => [esc(p.nom), String(p.qte), ar(p.ca)]),
        [1, 2],
      )
}

${section("État du stock")}
${releve([
  ["Produits actifs", String(nbActifs)],
  ["Valeur au prix de vente", ar(valeurStock)],
  ["En rupture", enRupture > 0 ? `<span style="color:#C0111C;font-weight:700">${enRupture}</span>` : "0"],
  ["Sous le seuil de commande", stockBas.length > 0 ? `<span style="color:#B45309;font-weight:700">${stockBas.length}</span>` : "0"],
])}

${section("Ventes du jour")}
${
  nbVentes === 0
    ? para("Aucune vente enregistrée sur la période.", 12)
    : tableau(
        ["N°", "Client", "Articles", "Total"],
        ventes.map((v) => [esc(v.id), esc(v.clientNom || "—"), String(v.nbArticles), ar(v.total)]),
        [2, 3],
      )
}

${
  nbAlertes === 0
    ? section("Alertes") +
      encadre({
        etiquette: "Contrôle du stock",
        valeur: "Aucune alerte",
        texte: "Aucun produit périmé, proche de péremption, ni sous son seuil de commande.",
        ton: "bon",
      })
    : `${section("Alertes")}
${
  perimes.length === 0
    ? ""
    : `${para(`<strong style="color:#C0111C">Produits périmés (${perimes.length})</strong> · à retirer de la vente sans délai.`, 12)}
${tableau(
  ["Produit", "Péremption", "Stock"],
  perimes.map((p) => [esc(p.designation), esc(p.prochainePeremption ?? "—"), p.stockAffiche]),
  [2],
)}`
}
${
  bientot.length === 0
    ? ""
    : `${para(`<strong style="color:#B45309">Péremption sous 90 jours (${bientot.length})</strong> · à écouler en priorité.`, 12)}
${tableau(
  ["Produit", "Péremption", "Échéance"],
  bientot.map((p) => [esc(p.designation), esc(p.prochainePeremption ?? "—"), `J-${p.joursAvantPeremption}`]),
  [2],
)}`
}
${
  stockBas.length === 0
    ? ""
    : `${para(`<strong style="color:#B45309">À commander (${stockBas.length})</strong> · stock au niveau du seuil ou en dessous.`, 12)}
${tableau(
  ["Produit", "Fournisseur", "Stock / seuil", "À commander"],
  stockBas
    .slice()
    .sort(
      (a, b) =>
        (a.fournisseur || "\uffff").localeCompare(b.fournisseur || "\uffff") ||
        a.designation.localeCompare(b.designation),
    )
    .map((p) => [
      esc(p.designation),
      esc(p.fournisseur || "—"),
      `${p.stockAffiche} / ${p.seuilAffiche}`,
      `<strong>${p.aCommander}</strong>`,
    ]),
  [2, 3],
)}`
}`
}

${bouton("https://lavitaperteonlus.vercel.app/pharmacie", "Ouvrir la Pharmacie")}

${pied([
  MENTION_DEVISE,
  "Compte rendu établi automatiquement à la clôture de la journée, à partir des ventes et des mouvements de stock enregistrés. Il rend compte de l'activité ; il ne constitue pas une pièce comptable.",
  "Destinataires modifiables dans Pharmacie → Paramètres.",
])}
`);
}
