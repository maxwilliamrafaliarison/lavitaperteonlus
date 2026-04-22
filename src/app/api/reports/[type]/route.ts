import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { logAudit, AuditAction } from "@/lib/sheets/audit";
import { getSite, getRoom } from "@/lib/sheets/sites";
import { generateReportPdf, reportFilename } from "@/lib/reports";
import { MATERIAL_TYPE_LABELS } from "@/types";
import type {
  ReportType,
  ReportFilters,
  ReportContext,
} from "@/lib/reports/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // @react-pdf/renderer nécessite Node, pas Edge

const VALID_TYPES: ReportType[] = [
  "inventaire",
  "a_remplacer",
  "valorisation",
  "mouvements",
  "par_utilisateur",
  "par_salle",
];

/**
 * POST /api/reports/:type
 * Body : { filters: ReportFilters }
 * Réponse : application/pdf stream avec Content-Disposition attachment
 *
 * Tous les rôles authentifiés peuvent générer des rapports.
 * Le contenu des rapports n'expose pas les MDP chiffrés.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { type } = await params;
  if (!VALID_TYPES.includes(type as ReportType)) {
    return NextResponse.json({ error: "Type de rapport inconnu" }, { status: 400 });
  }

  let body: { filters?: ReportFilters; groupedByService?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const filters = body.filters ?? {};

  const ctx: ReportContext = {
    lang: session.user.lang ?? "fr",
    generatedBy: session.user.name ?? session.user.email ?? "—",
    generatedAt: new Date().toISOString(),
    baseUrl: new URL(req.url).origin,
  };

  // Enrichir : résoudre les IDs en noms lisibles pour le PDF
  const enriched: {
    siteName?: string;
    roomName?: string;
    typeLabel?: string;
    stateLabel?: string;
    groupedByService?: boolean;
  } = { groupedByService: body.groupedByService };

  try {
    if (filters.siteId) {
      const site = await getSite(filters.siteId);
      if (site) enriched.siteName = `${site.name} (${site.code})`;
    }
    if (filters.roomId) {
      const room = await getRoom(filters.roomId);
      if (room) enriched.roomName = room.name;
    }
    if (filters.materialType) {
      enriched.typeLabel = MATERIAL_TYPE_LABELS[filters.materialType][ctx.lang];
    }
    if (filters.state) {
      enriched.stateLabel = filters.state;
    }
  } catch {
    // non bloquant
  }

  try {
    const stream = await generateReportPdf(type as ReportType, filters, ctx, enriched);

    // Audit : qui a généré quel rapport
    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email ?? "",
      action: AuditAction.ViewMaterial, // pas d'action dédiée 'generate_report', on réutilise
      targetType: "report",
      targetId: type,
      details: `Rapport ${type} généré (filtres : ${JSON.stringify(filters)})`,
      ip: req.headers.get("x-forwarded-for") ?? "",
      userAgent: req.headers.get("user-agent") ?? "",
    });

    const filename = reportFilename(type as ReportType, filters);

    // Convertir le Node stream en Web Stream pour Next.js response
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
    });

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[reports] generation failed", e);
    return NextResponse.json(
      { error: `Échec de la génération : ${String(e)}` },
      { status: 500 },
    );
  }
}
