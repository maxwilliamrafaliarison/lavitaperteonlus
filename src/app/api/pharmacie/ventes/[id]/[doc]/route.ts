import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { getVenteComplete, listParametres } from "@/lib/pharmacie/sheets";
import {
  renderVentePdf,
  orgInfoFromParams,
  fiscalFromParams,
} from "@/lib/pharmacie/pdf/documents";
import { isLang } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // @react-pdf/renderer nécessite Node

/**
 * GET /api/pharmacie/ventes/:id/ticket   → PDF rouleau 80 mm
 * GET /api/pharmacie/ventes/:id/facture  → PDF A4
 *
 * Ouvert en nouvel onglet depuis l'écran de confirmation de vente ;
 * ré-imprimable à tout moment (la vente est relue depuis le Sheet).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; doc: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!can(session.user.role, "app:pharmacie")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { id, doc } = await params;
  if (doc !== "ticket" && doc !== "facture") {
    return NextResponse.json({ error: "Document inconnu" }, { status: 404 });
  }
  if (!/^VTE-[A-Z0-9-]{6,40}$/.test(id)) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }

  const lang = isLang(session.user.lang) ? session.user.lang : "fr";

  try {
    const [vente, parametres] = await Promise.all([
      getVenteComplete(id),
      listParametres(),
    ]);
    if (!vente) {
      return NextResponse.json({ error: "Vente introuvable" }, { status: 404 });
    }

    // Espèces reçues : détail du moment de la vente, passé en query par
    // l'écran de confirmation. Absent lors d'une réimpression → on n'affiche
    // alors que « paiement : espèces », sans montant inventé.
    const recuRaw = Number(req.nextUrl.searchParams.get("recu"));
    const recu = Number.isFinite(recuRaw) && recuRaw > 0 ? recuRaw : undefined;

    const stream = await renderVentePdf(
      doc,
      vente,
      orgInfoFromParams(parametres),
      fiscalFromParams(parametres),
      lang,
      recu,
    );

    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: Buffer) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err: Error) => controller.error(err));
      },
    });

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": "application/pdf",
        // inline : s'ouvre dans l'onglet, l'utilisateur imprime depuis le viewer
        "Content-Disposition": `inline; filename="${doc}-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Génération impossible : ${String(e).slice(0, 160)}` },
      { status: 500 },
    );
  }
}
