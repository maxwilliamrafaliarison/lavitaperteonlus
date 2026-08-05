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
  | { ok: true; ecart: number; theorique: number; comptees: number }
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
    revalidatePath("/pharmacie/vente");
    revalidatePath("/pharmacie");
    return {
      ok: true,
      ecart: close.ecart ?? 0,
      theorique: close.total_theorique ?? 0,
      comptees: parsed.data.especesComptees,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
