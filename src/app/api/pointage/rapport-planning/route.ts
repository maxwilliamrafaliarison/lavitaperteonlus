import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { buildEtatPlanifieRealise } from "@/lib/planning/rapport";
import { renderEtatPlanifieRealise } from "@/lib/planning/rapport-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** renderToStream rend un flux Node ; NextResponse attend un flux Web. */
function toWebStream(stream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      stream.on("data", (c: Buffer) => controller.enqueue(new Uint8Array(c)));
      stream.on("end", () => controller.close());
      stream.on("error", (e: Error) => controller.error(e));
    },
  });
}

/**
 * État « planifié / réalisé » en PDF, sur une période choisie.
 * GET /api/pointage/rapport-planning?du=2026-07-01&au=2026-07-31
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!can(session.user.role, "pointage:lire")) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const url = new URL(req.url);
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const now = new Date(Date.now() + 3 * 3600 * 1000);
  const moisDefaut = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const du = DATE.test(url.searchParams.get("du") ?? "") ? url.searchParams.get("du")! : `${moisDefaut}-01`;
  const [a, m] = du.split("-").map(Number);
  const auDefaut = `${du.slice(0, 7)}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
  const au = DATE.test(url.searchParams.get("au") ?? "") ? url.searchParams.get("au")! : auDefaut;
  if (au < du) return NextResponse.json({ error: "Période invalide." }, { status: 400 });

  try {
    const data = await buildEtatPlanifieRealise(du, au);
    const stream = await renderEtatPlanifieRealise(data, {
      lang: session.user.lang,
      generatedBy: session.user.name ?? session.user.email ?? "",
      generatedAt: new Date().toISOString(),
    });
    return new NextResponse(toWebStream(stream), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="planifie-realise-${du}-${au}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `Génération impossible : ${String(e).slice(0, 200)}` }, { status: 500 });
  }
}
