import { listParametres } from "@/lib/pharmacie/sheets";
import { sbSelect } from "@/lib/supabase-server";

/* ============================================================
   IDENTITÉ LÉGALE DE L'ÉMETTEUR — mentions d'une pièce comptable
   ============================================================

   Un relevé de caisse n'est une pièce justificative que s'il permet
   d'identifier sans ambiguïté QUI l'a émis, POUR QUELLE PÉRIODE, et sous
   quel NUMÉRO dans une série continue. Ce socle est commun aux droits
   comptables européen et malgache.

   L'ÉMETTEUR EST L'ÉTABLISSEMENT DE FIANARANTSOA, immatriculé auprès de
   la Direction générale des impôts sous son NIF et son numéro
   statistique. Ce sont ces identifiants-là qui engagent une pièce remise
   à un patient ou transmise à l'administration locale ; ceux de
   l'organisation mère italienne peuvent l'accompagner, ils ne s'y
   substituent pas.

   Les données d'immatriculation ne sont PAS codées en dur : elles vivent
   dans les paramètres, parce qu'une adresse ou un numéro se corrige sans
   redéploiement. Tant qu'une mention obligatoire manque, le document le
   signale plutôt que de laisser un blanc — un blanc se lit comme un
   défaut d'impression, un avertissement se lit comme une consigne.
   ============================================================ */

export interface EntiteLegale {
  denomination: string;
  formeJuridique: string;
  siegeSocial: string;
  codeFiscal: string;
  etablissement: string;
  /**
   * Identifiants fiscaux MALGACHES — les seuls qui engagent ici.
   *
   * L'entité qui émet ces pièces est l'établissement de Fianarantsoa,
   * immatriculé auprès de la Direction générale des impôts : c'est son
   * NIF et son numéro statistique qui l'identifient, pas ceux de
   * l'organisation mère italienne. Le code fiscal italien reste
   * saisissable, mais à titre de complément — son absence n'affecte
   * pas la validité d'une pièce émise à Madagascar.
   */
  nif: string;
  stat: string;
  /** Vrai tant qu'une mention obligatoire manque. */
  incomplete: boolean;
  manquants: string[];
}

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
  // Complément facultatif : l'organisation mère, si on veut la citer.
  const codeFiscal = lire("entite_code_fiscal");
  const etablissement =
    lire("entite_etablissement") || `Centre ${site} · Fianarantsoa, Madagascar`;

  /* Les identifiants malgaches vivent déjà sous les clés `facture_*`,
     utilisées par les tickets et factures. On les relit ici plutôt que
     d'en créer de nouvelles : deux jeux de clés pour la même donnée
     finiraient par diverger, et une pièce porterait alors un numéro
     différent de l'autre. */
  const nif = lire("entite_nif") || lire("facture_nif");
  const stat = lire("entite_stat") || lire("facture_stat");

  /* Ce qu'une pièce DOIT porter pour identifier son émetteur ici :
     l'adresse déclarée et les deux identifiants fiscaux malgaches. Le
     code fiscal italien n'y figure pas — l'établissement de Fianarantsoa
     est l'émetteur, et c'est son immatriculation locale qui l'engage. */
  const manquants: string[] = [];
  if (!siegeSocial) manquants.push("adresse de l'établissement");
  if (!nif) manquants.push("NIF");
  if (!stat) manquants.push("STAT");

  return {
    denomination,
    formeJuridique,
    siegeSocial,
    codeFiscal,
    etablissement,
    nif,
    stat,
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

/**
 * Conservation décennale.
 *
 * Dix ans est la durée retenue tant par le droit comptable malgache que
 * par le Codice Civile italien, ce qui évite d'avoir à trancher entre les
 * deux. La formulation reste générique à dessein : citer un article précis
 * exigerait d'en vérifier la rédaction en vigueur, et une référence
 * erronée sur une pièce vaut moins qu'une obligation énoncée simplement.
 */
export const MENTION_CONSERVATION =
  "Pièce justificative à conserver dix ans à compter de la clôture de l'exercice, conformément à la réglementation comptable en vigueur.";

export const MENTION_DEVISE =
  "Montants exprimés en ariary malgache (MGA). Aucune subdivision décimale en usage.";
