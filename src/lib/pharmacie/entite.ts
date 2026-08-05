import { listParametres } from "@/lib/pharmacie/sheets";
import { sbSelect } from "@/lib/supabase-server";

/* ============================================================
   IDENTITÉ LÉGALE DE L'ÉMETTEUR — mentions d'une pièce comptable
   ============================================================

   Un relevé de caisse n'est une pièce justificative que s'il permet
   d'identifier sans ambiguïté QUI l'a émis, POUR QUELLE PÉRIODE, et sous
   quel NUMÉRO dans une série continue. Ces trois éléments sont le socle
   commun des obligations comptables européennes ; pour une organisation de
   volontariat italienne, ils découlent des articles 2214 à 2220 du Codice
   Civile (tenue et conservation des livres) et du D.Lgs. 117/2017 qui régit
   les entités du Terzo Settore.

   Les données d'immatriculation ne sont PAS codées en dur : elles vivent
   dans les paramètres de l'application, parce qu'un siège social ou un code
   fiscal se corrige sans redéploiement. Tant qu'un champ n'est pas
   renseigné, le document l'indique explicitement plutôt que de laisser un
   blanc — un blanc se lit comme un oubli d'impression, une mention « à
   renseigner » se lit comme une consigne.
   ============================================================ */

export interface EntiteLegale {
  denomination: string;
  formeJuridique: string;
  siegeSocial: string;
  codeFiscal: string;
  etablissement: string;
  /** Vrai tant qu'une mention obligatoire manque. */
  incomplete: boolean;
  manquants: string[];
}

const A_RENSEIGNER = "à renseigner";

export async function chargerEntite(site = "REX"): Promise<EntiteLegale> {
  let p: Map<string, string>;
  try {
    p = await listParametres();
  } catch {
    p = new Map();
  }
  const lire = (k: string) => (p.get(k) ?? "").trim();

  const denomination = lire("entite_denomination") || "La Vita Per Te — ONG-ODV Alfeo Corassori";
  const formeJuridique =
    lire("entite_forme_juridique") || "Organizzazione di Volontariato (ODV) · Ente del Terzo Settore";
  const siegeSocial = lire("entite_siege_social");
  const codeFiscal = lire("entite_code_fiscal");
  const etablissement =
    lire("entite_etablissement") || `Centre ${site} · Fianarantsoa, Madagascar`;

  const manquants: string[] = [];
  if (!siegeSocial) manquants.push("siège social");
  if (!codeFiscal) manquants.push("code fiscal / P. IVA");

  return {
    denomination,
    formeJuridique,
    siegeSocial: siegeSocial || A_RENSEIGNER,
    codeFiscal: codeFiscal || A_RENSEIGNER,
    etablissement,
    incomplete: manquants.length > 0,
    manquants,
  };
}

/**
 * Numéro de pièce dans une série continue par année civile.
 *
 * La continuité est ce qui rend une série vérifiable : un contrôleur doit
 * pouvoir constater qu'aucune pièce ne manque entre deux numéros. On compte
 * donc les séances de l'année OUVERTES AVANT celle-ci — le rang ne dépend
 * ainsi ni de l'ordre d'impression, ni du moment où le document est
 * regénéré, et réimprimer une pièce ancienne redonne toujours son numéro.
 */
export async function numeroPiece(sessionId: string, ouverteLe: string, site = "REX"): Promise<string> {
  const annee = new Date(ouverteLe).toLocaleDateString("fr-FR", {
    year: "numeric",
    timeZone: "Indian/Antananarivo",
  });
  const debutAnnee = `${annee}-01-01`;

  let rang = 1;
  for (let offset = 0; ; offset += 1000) {
    const { rows } = await sbSelect<{ id: string; ouverte_le: string }>(
      "pharmacie",
      "caisse_sessions",
      {
        select: "id,ouverte_le",
        filters: { site: `eq.${site}`, ouverte_le: `gte.${debutAnnee}` },
        order: "ouverte_le.asc",
        limit: 1000,
        offset,
      },
    );
    for (const r of rows) {
      if (r.id === sessionId) {
        return `CAISSE-${annee}-${String(rang).padStart(4, "0")}`;
      }
      if (r.ouverte_le < ouverteLe) rang += 1;
    }
    if (rows.length < 1000) break;
  }
  return `CAISSE-${annee}-${String(rang).padStart(4, "0")}`;
}

/** Durée légale de conservation : 10 ans (art. 2220 Codice Civile). */
export const MENTION_CONSERVATION =
  "Pièce justificative à conserver dix ans à compter de la clôture de l'exercice (art. 2220 Codice Civile).";

export const MENTION_DEVISE =
  "Montants exprimés en ariary malgache (MGA). Aucune subdivision décimale en usage.";
