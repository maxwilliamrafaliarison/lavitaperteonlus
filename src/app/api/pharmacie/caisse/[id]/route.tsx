import { NextRequest, NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { sbSelect } from "@/lib/supabase-server";
import { construireEtatCaisse } from "@/lib/pharmacie/caisse-etat";
import { EtatCaissePdf } from "@/lib/pharmacie/reports/caisse-pdf";
import { chargerEntite, numeroPiece } from "@/lib/pharmacie/entite";
import type { CaisseSession } from "@/lib/pharmacie/caisse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/* ============================================================
   ÉTAT DE CAISSE (PDF) — /api/pharmacie/caisse/CSE-…
   ============================================================
   Imprimable au comptoir en fin de journée, et joint au courriel envoyé à
   l'administration. Toujours régénéré à la demande : un PDF figé à la
   clôture deviendrait faux si une vente de la séance était annulée ensuite.
   ============================================================ */

function toWebStream(stream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      stream.on("data", (c: Buffer) => controller.enqueue(new Uint8Array(c)));
      stream.on("end", () => controller.close());
      stream.on("error", (e: Error) => controller.error(e));
    },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(session.user.role, "app:pharmacie")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { id } = await params;
  // Format contrôlé : l'identifiant part dans un filtre PostgREST.
  if (!/^CSE-[A-Z0-9-]{4,40}$/.test(id)) {
    return NextResponse.json({ error: "Identifiant de séance invalide" }, { status: 400 });
  }

  const { rows } = await sbSelect<CaisseSession>("pharmacie", "caisse_sessions", {
    filters: { id: `eq.${id}` },
    limit: 1,
  });
  const caisse = rows[0];
  if (!caisse) return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });

  const [etat, entite, numero] = await Promise.all([
    construireEtatCaisse(caisse),
    chargerEntite(caisse.site),
    numeroPiece(caisse.id, caisse.ouverte_le, caisse.site),
  ]);
  const stream = await renderToStream(
    <EtatCaissePdf etat={etat} entite={entite} numero={numero} />,
  );

  return new NextResponse(toWebStream(stream), {
    headers: {
      "Content-Type": "application/pdf",
      // Le nom de fichier porte le NUMÉRO DE PIÈCE, pas l'identifiant
      // technique : c'est sous ce numéro que le document sera classé.
      "Content-Disposition": `inline; filename="${numero}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
