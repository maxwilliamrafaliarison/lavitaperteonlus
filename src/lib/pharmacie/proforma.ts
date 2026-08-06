import { sbSelect, sbInsert, sbUpdate } from "@/lib/supabase-server";

/* ============================================================
   DEVIS (PROFORMA) — couche données
   ============================================================

   Un devis ne produit aucune écriture comptable. Cette table sert le
   pilotage : combien de patients repartent avec un prix, combien
   reviennent acheter. Le taux de transformation se mesure mal de tête,
   et il dit des choses utiles — un tarif trop haut, une rupture qui
   fait fuir, une ordonnance qu'on n'honore pas.

   Tout y est TOLÉRANT À L'ABSENCE DE TABLE : tant que la migration n'est
   pas passée, éditer un devis doit rester possible. Une trace de pilotage
   ne vaut pas qu'on empêche le comptoir de travailler.
   ============================================================ */

export interface LigneProformaStockee {
  designation: string;
  detail: string;
  quantite: number;
  unite: string;
  prixUnitaire: number;
  total: number;
}

export interface Proforma {
  id: string;
  timestamp: string;
  site: string;
  client_nom: string;
  total: number;
  operateur_email: string;
  valide_jusquau: string;
  lignes: LigneProformaStockee[];
  statut: "emis" | "transforme";
  vente_id: string;
  transforme_le: string;
}

/** Vrai si la table existe : l'écran s'adapte au lieu de tomber. */
export async function proformasDisponibles(): Promise<boolean> {
  try {
    await sbSelect<{ id: string }>("pharmacie", "proformas", { select: "id", limit: 1 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Enregistre un devis émis.
 *
 * Best-effort ASSUMÉ : si l'écriture échoue, le PDF est tout de même
 * remis au patient. Perdre une ligne de statistique est sans gravité ;
 * refuser un devis parce qu'une table de pilotage est indisponible le
 * serait beaucoup plus, cliente devant le comptoir.
 */
export async function enregistrerProforma(p: {
  id: string;
  clientNom: string;
  total: number;
  operateurEmail: string;
  valideJusquau: string;
  lignes: LigneProformaStockee[];
  site?: string;
}): Promise<boolean> {
  try {
    await sbInsert("pharmacie", "proformas", [
      {
        id: p.id,
        timestamp: new Date().toISOString(),
        site: p.site ?? "REX",
        client_nom: p.clientNom,
        total: p.total,
        operateur_email: p.operateurEmail,
        valide_jusquau: p.valideJusquau,
        lignes: p.lignes,
        statut: "emis",
        vente_id: "",
        transforme_le: "",
      },
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Marque un devis comme transformé en vente.
 *
 * Idempotent par construction : le filtre exige `statut = 'emis'`, si
 * bien qu'un second appel ne réécrit rien — la date de transformation
 * reste celle de la vente qui l'a réellement suivi.
 */
export async function marquerTransforme(proformaId: string, venteId: string): Promise<void> {
  try {
    await sbUpdate(
      "pharmacie",
      "proformas",
      { id: `eq.${proformaId}`, statut: "eq.emis" },
      { statut: "transforme", vente_id: venteId, transforme_le: new Date().toISOString() },
    );
  } catch {
    // Sans effet sur la vente : elle est déjà enregistrée.
  }
}

export interface StatsProforma {
  emis: number;
  transformes: number;
  /** Part transformée, en pourcentage entier. */
  taux: number;
  montantEmis: number;
  montantTransforme: number;
}

/** Devis d'une période, du plus récent au plus ancien. */
export async function listProformas(depuis?: string, limite = 200): Promise<Proforma[]> {
  try {
    const { rows } = await sbSelect<Proforma>("pharmacie", "proformas", {
      filters: depuis ? { timestamp: `gte.${depuis}` } : undefined,
      order: "timestamp.desc",
      limit: Math.min(limite, 1000),
    });
    return rows.map((r) => ({ ...r, lignes: Array.isArray(r.lignes) ? r.lignes : [] }));
  } catch {
    return [];
  }
}

export function calculerStats(devis: Proforma[]): StatsProforma {
  const transformes = devis.filter((d) => d.statut === "transforme");
  return {
    emis: devis.length,
    transformes: transformes.length,
    taux: devis.length === 0 ? 0 : Math.round((transformes.length / devis.length) * 100),
    montantEmis: devis.reduce((s, d) => s + Number(d.total ?? 0), 0),
    montantTransforme: transformes.reduce((s, d) => s + Number(d.total ?? 0), 0),
  };
}
