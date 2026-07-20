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
  const { tvaActive, tvaTaux } = parsed.data;

  try {
    // "1"/"0" plutôt qu'un booléen : la table parametres est du texte, et un
    // lecteur (ticket, facture) teste `valeur === "1"` sans ambiguïté.
    await setParametre("tva_active", tvaActive ? "1" : "0");
    await setParametre("tva_taux", String(tvaTaux));
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
