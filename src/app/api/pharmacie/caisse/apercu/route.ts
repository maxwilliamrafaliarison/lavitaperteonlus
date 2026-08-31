import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { getUserByEmail } from "@/lib/sheets/users";
import { sbSelect } from "@/lib/supabase-server";
import { construireEtatCaisse } from "@/lib/pharmacie/caisse-etat";
import { htmlEtatCaisse } from "@/lib/pharmacie/caisse-mail";
import { chargerEntite, numeroPiece } from "@/lib/pharmacie/entite";
import { envoyerMail } from "@/lib/mail";
import type { CaisseSession } from "@/lib/pharmacie/caisse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/* ============================================================
   APERÇU DU RELEVÉ DE CAISSE — /api/pharmacie/caisse/apercu
   ============================================================

   Le relevé ne partait qu'à la clôture d'une séance. Relire le document
   supposait donc d'attendre qu'une caisse se ferme, ou de fermer une caisse
   pour voir un courriel : deux façons de corriger trop tard.

   Cette route rejoue le dernier relevé émis, vers UNE SEULE adresse. Elle
   n'écrit rien, ne clôture rien, et ne touche à aucune séance : elle
   recompose et envoie.

   ── LE GARDE-FOU EST CELUI DU RÉCAPITULATIF QUOTIDIEN ────────────────────
   L'adresse doit être celle d'un COMPTE ACTIF de l'application. Sans cette
   condition, la route deviendrait un relais de courrier ouvert à qui détient
   le secret du cron, ce qui ferait de la messagerie du centre un émetteur de
   courriels arbitraires.
   ============================================================ */

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const entete = req.headers.get("authorization");
  const parCron = Boolean(cronSecret) && entete === `Bearer ${cronSecret}`;
  if (!parCron) {
    const session = await auth();
    if (!session?.user || !can(session.user.role, "app:pharmacie")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
  }

  const demande = req.nextUrl.searchParams.get("apercu")?.trim().toLowerCase() ?? "";
  if (!demande) {
    return NextResponse.json(
      { error: "Paramètre ?apercu=<adresse> obligatoire : cette route n'écrit qu'à une personne." },
      { status: 400 },
    );
  }
  const compte = await getUserByEmail(demande).catch(() => null);
  if (!compte?.active) {
    return NextResponse.json(
      { error: "Aperçu refusé : cette adresse n'est pas celle d'un compte actif." },
      { status: 400 },
    );
  }

  /* La dernière séance CLÔTURÉE : une séance ouverte n'a ni espèces comptées
     ni écart, et son relevé ne montrerait pas ce qu'on vient relire. */
  const { rows } = await sbSelect<CaisseSession>("pharmacie", "caisse_sessions", {
    filters: { fermee_le: "neq." },
    order: "fermee_le.desc",
    limit: 1,
  });
  const caisse = rows[0];
  if (!caisse) {
    return NextResponse.json(
      { error: "Aucune séance clôturée : rien à prévisualiser." },
      { status: 404 },
    );
  }

  const [etat, entite, numero] = await Promise.all([
    construireEtatCaisse(caisse),
    chargerEntite(caisse.site),
    numeroPiece(caisse.id, caisse.ouverte_le, caisse.site),
  ]);
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const envoi = await envoyerMail({
    destinataires: [compte.email],
    // Le sujet dit « aperçu » : ce courriel ne doit pas être classé comme
    // la pièce justificative, qui est celle partie à la clôture.
    sujet: `[Aperçu] ${numero} · Relevé de caisse ${caisse.site}`,
    html: htmlEtatCaisse(etat, entite, numero, base),
    expediteurLabel: "Pharmacie · La Vita Per Te",
  });

  return NextResponse.json({
    ok: envoi.envoye,
    detail: envoi.detail,
    seance: caisse.id,
    piece: numero,
    destinataire: compte.email,
  });
}
