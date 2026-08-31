"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { getCaisseOuverte, ouvrirCaisse, cloreCaisse } from "@/lib/pharmacie/caisse";
import { getT } from "@/lib/i18n";

/* ============================================================
   ACTIONS CAISSE — ouverture et clôture comptées
   ============================================================ */

type Resultat =
  | { ok: true }
  /* La clôture renvoie l'identifiant de la séance : l'écran en a besoin
     pour ouvrir la pièce comptable, qui se numérote côté serveur. */
  | { ok: true; sessionId: string; ecart: number; theorique: number; comptees: number }
  | { ok: false; error: string };

const ouvrirSchema = z.object({
  // Montant en ariary, entier positif ou nul : un fonds de caisse ne se
  // saisit pas en centimes à Madagascar.
  fondsInitial: z.number().int().min(0).max(100_000_000),
});

export async function ouvrirCaisseAction(raw: unknown): Promise<Resultat> {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "pharmacie:vendre")) {
    return { ok: false, error: "Accès refusé" };
  }
  const t = getT(session.user.lang);
  const parsed = ouvrirSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: t("pharmacie.caisse_montant_invalide") };

  try {
    await ouvrirCaisse({
      par: session.user.email ?? "",
      fondsInitial: parsed.data.fondsInitial,
    });
    revalidatePath("/pharmacie/vente");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const cloreSchema = z.object({
  especesComptees: z.number().int().min(0).max(1_000_000_000),
  note: z.string().max(500).default(""),
});

export async function cloreCaisseAction(raw: unknown): Promise<Resultat> {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "pharmacie:vendre")) {
    return { ok: false, error: "Accès refusé" };
  }
  const t = getT(session.user.lang);
  const parsed = cloreSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: t("pharmacie.caisse_montant_invalide") };

  try {
    const ouverte = await getCaisseOuverte();
    if (!ouverte) return { ok: false, error: t("pharmacie.caisse_deja_fermee") };
    const close = await cloreCaisse({
      session: ouverte,
      par: session.user.email ?? "",
      especesComptees: parsed.data.especesComptees,
      note: parsed.data.note,
    });
    /* L'état part à l'administration, SANS conditionner la clôture.
       Les espèces sont comptées et l'écart est écrit : une panne de
       messagerie ne doit ni empêcher de fermer, ni faire croire à un échec.
       On attend tout de même l'envoi — sur Vercel, une promesse laissée en
       suspens après la réponse est tuée avec la fonction, et le courriel ne
       partirait jamais. */
    try {
      const { construireEtatCaisse } = await import("@/lib/pharmacie/caisse-etat");
      const { envoyerEtatCaisse } = await import("@/lib/pharmacie/caisse-mail");
      const etat = await construireEtatCaisse(close);
      /* Plus d'adresse de base à passer : le relevé ne renvoie plus vers
         l'application, il porte le PDF en pièce jointe. */
      await envoyerEtatCaisse(etat);
    } catch {
      // Journalisé côté hébergeur ; l'écran ne s'en émeut pas.
    }

    revalidatePath("/pharmacie/vente");
    revalidatePath("/pharmacie");
    return {
      ok: true,
      sessionId: close.id,
      ecart: close.ecart ?? 0,
      theorique: close.total_theorique ?? 0,
      comptees: parsed.data.especesComptees,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
