import { sbSelect } from "@/lib/supabase-server";

import type { CaisseSession } from "./caisse";

/* ============================================================
   ÉTAT DE CAISSE — la matière d'une clôture
   ============================================================

   Une seule fonction produit les chiffres, et deux formes les rendent : le
   PDF imprimé au comptoir et le courriel envoyé à l'administration. Les
   calculer deux fois, c'est se garantir qu'un jour les deux ne diront plus
   la même chose — et c'est précisément le document qui doit faire foi.

   Les ventes retenues sont celles de la SESSION : entre son ouverture et sa
   clôture. Pas « celles du jour » — une caisse ouverte tard le soir et close
   le lendemain matin appartient à une seule session, et c'est elle qu'on
   rapproche du tiroir.
   ============================================================ */

export interface LigneOperatrice {
  email: string;
  /** Prénom lisible, déduit de l'adresse (avant @). */
  nom: string;
  nbVentes: number;
  totalComptant: number;
}

export interface EtatCaisse {
  session: CaisseSession;
  /** Ventes comptant non annulées de la session. */
  nbVentesComptant: number;
  totalComptant: number;
  /** Prises en charge : aucun encaissement, mais elles ont sorti du stock. */
  nbPec: number;
  valeurPec: number;
  /** Ventes annulées pendant la session — traçées, jamais masquées. */
  nbAnnulees: number;
  parOperatrice: LigneOperatrice[];
  theorique: number;
  comptees: number | null;
  ecart: number | null;
}

interface VenteBrute {
  id: string;
  timestamp: string;
  total: number;
  type_vente: string;
  statut: string;
  operateur_email: string;
  valeur_pec: number;
}

/** Prénom lisible à partir d'une adresse : « lida.lavitaperte@… » → « lida ». */
function nomDe(email: string): string {
  const avant = (email || "").split("@")[0] ?? "";
  const brut = avant.split(".")[0] || avant || "—";
  return brut.charAt(0).toUpperCase() + brut.slice(1);
}

export async function construireEtatCaisse(session: CaisseSession): Promise<EtatCaisse> {
  // Borne haute : la clôture si elle a eu lieu, sinon maintenant.
  const fin = session.fermee_le || new Date().toISOString();

  const ventes: VenteBrute[] = [];
  // Pagination obligatoire : PostgREST plafonne CHAQUE réponse à 1000 lignes,
  // quelle que soit la limite demandée. Sans elle, une journée chargée
  // sous-compterait la caisse en silence.
  for (let offset = 0; ; offset += 1000) {
    const { rows } = await sbSelect<VenteBrute>("pharmacie", "ventes", {
      select: "id,timestamp,total,type_vente,statut,operateur_email,valeur_pec",
      filters: { timestamp: `gte.${session.ouverte_le}` },
      limit: 1000,
      offset,
    });
    for (const v of rows) {
      if (v.timestamp <= fin) ventes.push(v);
    }
    if (rows.length < 1000) break;
  }

  let nbVentesComptant = 0;
  let totalComptant = 0;
  let nbPec = 0;
  let valeurPec = 0;
  let nbAnnulees = 0;
  const parEmail = new Map<string, LigneOperatrice>();

  for (const v of ventes) {
    const annulee = String(v.statut ?? "active") === "annulee";
    if (annulee) {
      nbAnnulees += 1;
      continue; // aucune espèce dans le tiroir
    }
    if (String(v.type_vente ?? "cash") === "pec") {
      nbPec += 1;
      valeurPec += Number(v.valeur_pec ?? 0);
      continue;
    }
    const montant = Number(v.total ?? 0);
    nbVentesComptant += 1;
    totalComptant += montant;

    const email = v.operateur_email || "";
    const ligne = parEmail.get(email) ?? { email, nom: nomDe(email), nbVentes: 0, totalComptant: 0 };
    ligne.nbVentes += 1;
    ligne.totalComptant += montant;
    parEmail.set(email, ligne);
  }

  const theorique = session.fonds_initial + totalComptant;

  return {
    session,
    nbVentesComptant,
    totalComptant,
    nbPec,
    valeurPec,
    nbAnnulees,
    parOperatrice: [...parEmail.values()].sort((a, b) => b.totalComptant - a.totalComptant),
    theorique,
    // Sur une session close, on conserve le théorique ENREGISTRÉ à la
    // clôture plutôt que de le recalculer : une vente annulée le lendemain
    // ne doit pas réécrire l'écart constaté ce soir-là, tiroir en main.
    comptees: session.especes_comptees,
    ecart: session.ecart,
  };
}
