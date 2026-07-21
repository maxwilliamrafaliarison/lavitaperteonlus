import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  buildRapportData,
  PHARMA_RAPPORTS,
  type PharmaRapportType,
} from "@/lib/pharmacie/reports/data";
import {
  renderPharmacieRapport,
  titreRapport,
} from "@/lib/pharmacie/reports/documents";
import { buildBilanMensuel } from "@/lib/pharmacie/reports/bilan";
import { renderBilanMensuel } from "@/lib/pharmacie/reports/bilan-pdf";
import { isLang } from "@/lib/i18n";

/** Emballe un flux Node en flux web pour NextResponse. */
function toWebStream(stream: NodeJS.ReadableStream): ReadableStream {
  return new ReadableStream({
    start(controller) {
      stream.on("data", (c: Buffer) => controller.enqueue(c));
      stream.on("end", () => controller.close());
      stream.on("error", (e: Error) => controller.error(e));
    },
  });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // @react-pdf/renderer nécessite Node
export const maxDuration = 60;

/**
 * GET /api/pharmacie/rapports/:type[?from=YYYY-MM-DD&to=YYYY-MM-DD]
 * → PDF A4. Le rapport « ventes » lit la période (défaut : mois en cours) ;
 * les autres photographient l'état courant du stock.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!can(session.user.role, "pharmacie:stock")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { type } = await params;
  const lang = isLang(session.user.lang) ? session.user.lang : "fr";

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const qFrom = req.nextUrl.searchParams.get("from") ?? "";
  const qTo = req.nextUrl.searchParams.get("to") ?? "";
  // Défaut : du 1er du mois courant à aujourd'hui.
  const now = new Date();
  const defFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const defTo = now.toISOString().slice(0, 10);
  const from = dateRe.test(qFrom) ? qFrom : defFrom;
  const to = dateRe.test(qTo) ? qTo : defTo;

  // Le BILAN MENSUEL est un document pluri-sections à part (données et rendu
  // dédiés), servi par le même endpoint pour un point d'entrée unique.
  if (type === "bilan") {
    try {
      const data = await buildBilanMensuel(from, to);
      const stream = await renderBilanMensuel(data, {
        lang,
        generatedBy: session.user.name ?? session.user.email ?? "—",
        generatedAt: new Date().toISOString(),
      });
      return new NextResponse(toWebStream(stream), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="bilan-mensuel-${from.slice(0, 7)}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (e) {
      return NextResponse.json({ error: `Génération impossible : ${String(e).slice(0, 160)}` }, { status: 500 });
    }
  }

  if (!PHARMA_RAPPORTS.includes(type as PharmaRapportType)) {
    return NextResponse.json({ error: "Rapport inconnu" }, { status: 404 });
  }
  const rapport = type as PharmaRapportType;

  try {
    const data = await buildRapportData(rapport, { from, to });
    const stream = await renderPharmacieRapport(data, {
      lang,
      generatedBy: session.user.name ?? session.user.email ?? "—",
      generatedAt: new Date().toISOString(),
    });

    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: Buffer) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err: Error) => controller.error(err));
      },
    });

    const slug = titreRapport(rapport, lang)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // enlève les accents (diacritiques)
      .replace(/[^a-z0-9]+/g, "-");

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${slug}-${to}.pdf"`,
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
