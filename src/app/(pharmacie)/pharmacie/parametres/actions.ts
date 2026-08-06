"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { setParametre } from "@/lib/pharmacie/sheets";
import { getT, isLang } from "@/lib/i18n";

const ParametresInput = z.object({
  /** La TVA figure-t-elle sur les tickets et factures ? Défaut : non. */
  tvaActive: z.boolean().default(false),
  /** Taux de TVA en pourcentage (0–100). Ignoré si tvaActive = false. */
  tvaTaux: z.number().min(0).max(100).default(0),

  /* Identité légale portée par les pièces comptables (état de caisse,
     factures). Facultatifs au sens du formulaire — on n'empêche pas de
     travailler faute d'un code fiscal — mais leur absence est signalée
     sur chaque document, car une pièce sans émetteur identifiable n'est
     pas opposable. */
  siegeSocial: z.string().trim().max(200).default(""),
  codeFiscal: z.string().trim().max(60).default(""),
  /* Identifiants fiscaux malgaches de l'établissement : la pharmacie vend
     à Fianarantsoa, sous droit local, quand la comptabilité consolidée
     relève du droit italien. Une pièce porte donc les deux. */
  nif: z.string().trim().max(40).default(""),
  stat: z.string().trim().max(40).default(""),
  denomination: z.string().trim().max(160).default(""),
  formeJuridique: z.string().trim().max(160).default(""),
  /** Destinataires de l'état de caisse, séparés par des virgules. */
  emailCaisse: z.string().trim().max(400).default(""),
});

export type ParametresResult = { ok: true } | { ok: false; error: string };

/**
 * Écrit les paramètres de TVA. RÉSERVÉ À L'ADMINISTRATEUR : au comptoir on
 * ne facture pas la TVA par défaut, mais la comptabilité peut demander de
 * l'activer. Le pharmacien vend ; il ne décide pas du régime fiscal.
 */
export async function definirParametresAction(
  raw: unknown,
): Promise<ParametresResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  const lang = isLang(session.user.lang) ? session.user.lang : "fr";
  const t = getT(lang);

  if (!can(session.user.role, "pharmacie:config")) {
    return { ok: false, error: t("pharmacie.param_error_forbidden") };
  }

  const parsed = ParametresInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: t("pharmacie.param_error_invalid") };
  }
  const { tvaActive, tvaTaux, siegeSocial, codeFiscal, denomination, formeJuridique, emailCaisse, nif, stat } =
    parsed.data;

  try {
    // "1"/"0" plutôt qu'un booléen : la table parametres est du texte, et un
    // lecteur (ticket, facture) teste `valeur === "1"` sans ambiguïté.
    await setParametre("tva_active", tvaActive ? "1" : "0");
    await setParametre("tva_taux", String(tvaTaux));

    /* Identité légale des pièces comptables. Écrite même vide : effacer un
       champ doit pouvoir se faire depuis l'écran, sinon une valeur erronée
       resterait à jamais faute de moyen de la retirer. */
    await setParametre("entite_siege_social", siegeSocial);
    await setParametre("entite_code_fiscal", codeFiscal);
    await setParametre("entite_denomination", denomination);
    await setParametre("entite_forme_juridique", formeJuridique);
    await setParametre("email_caisse_destinataires", emailCaisse);
    /* Écrit sous les clés `facture_*`, déjà lues par les tickets et
       factures : un seul jeu de clés pour une même donnée, sinon deux
       pièces finiraient par porter des numéros différents. */
    await setParametre("facture_nif", nif);
    await setParametre("facture_stat", stat);
  } catch (e) {
    return {
      ok: false,
      error: t("pharmacie.vente_error_write", { detail: String(e).slice(0, 120) }),
    };
  }

  revalidatePath("/pharmacie/parametres");
  revalidatePath("/pharmacie");
  return { ok: true };
}
