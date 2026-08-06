import { NextRequest, NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import { z } from "zod";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { chargerEntite } from "@/lib/pharmacie/entite";
import { ProformaPdf, ProformaTicket } from "@/lib/pharmacie/reports/proforma-pdf";
import { enregistrerProforma } from "@/lib/pharmacie/proforma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/* ============================================================
   DEVIS (PROFORMA) — /api/pharmacie/proforma
   ============================================================
   Rend un PDF à partir du panier courant, SANS RIEN ÉCRIRE : ni vente, ni
   mouvement de stock, ni réservation. C'est la propriété essentielle de ce
   document, et la raison pour laquelle il ne passe pas par l'action de
   vente : aucun chemin de code ne peut transformer par accident un devis
   en encaissement.

   Une TRACE est en revanche conservée, à des fins de pilotage seulement :
   savoir combien de patients repartent avec un prix et combien reviennent
   acheter. Cette écriture est best-effort et ne conditionne jamais la
   remise du devis.

   La numérotation est horodatée, dans une série DISTINCTE de celle des
   factures — les mêler ferait apparaître des trous dans la série
   comptable, puisque la plupart des devis ne deviennent jamais des ventes.
   ============================================================ */

const Ligne = z.object({
  designation: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(200).default(""),
  quantite: z.number().int().positive().max(100000),
  unite: z.string().trim().max(40).default(""),
  prixUnitaire: z.number().nonnegative().max(100_000_000),
  total: z.number().nonnegative().max(100_000_000),
});

const Corps = z.object({
  client: z.string().trim().max(120).default(""),
  lignes: z.array(Ligne).min(1).max(100),
  /** Nombre de jours de validité ; borné pour rester une estimation. */
  validiteJours: z.number().int().min(1).max(90).default(7),
  /** « ticket » (80 mm, comptoir) ou « a4 » (remise formelle). */
  format: z.enum(["ticket", "a4"]).default("ticket"),
});

function toWebStream(stream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      stream.on("data", (c: Buffer) => controller.enqueue(new Uint8Array(c)));
      stream.on("end", () => controller.close());
      stream.on("error", (e: Error) => controller.error(e));
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  // Même droit que la vente : c'est le geste du comptoir.
  if (!can(session.user.role, "pharmacie:vendre")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const parsed = Corps.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Devis invalide" }, { status: 400 });
  }
  const { client, lignes, validiteJours, format } = parsed.data;

  const maintenant = new Date();
  const validite = new Date(maintenant.getTime() + validiteJours * 86_400_000);

  /* Numéro horodaté à la seconde près, préfixé DEV pour qu'aucun regard ne
     le confonde avec une facture. Deux devis émis dans la même seconde par
     deux postes porteraient le même numéro : sans persistance, le risque
     est théorique et sans conséquence — un devis n'engage aucune écriture. */
  const horodatage = maintenant
    .toLocaleString("sv-SE", { timeZone: "Indian/Antananarivo" })
    .replace(/[-: ]/g, "");
  const numero = `DEV-${horodatage}`;

  const entite = await chargerEntite();
  const total = lignes.reduce((s, l) => s + l.total, 0);

  const data = {
    numero,
    emisLe: maintenant.toISOString(),
    valideJusquau: validite.toISOString(),
    client,
    lignes,
    total,
    emisPar: session.user.name || session.user.email || "—",
  };

  /* Trace de pilotage, écrite AVANT le rendu mais sans le conditionner :
     enregistrerProforma avale ses erreurs et rend un booléen. Perdre une
     ligne de statistique est sans gravité ; refuser un devis parce qu'une
     table de suivi est indisponible le serait beaucoup plus, patient
     devant le comptoir. */
  await enregistrerProforma({
    id: numero,
    clientNom: client,
    total,
    operateurEmail: session.user.email ?? "",
    valideJusquau: validite.toISOString(),
    lignes,
  });

  const stream = await renderToStream(
    format === "a4" ? <ProformaPdf data={data} entite={entite} /> : <ProformaTicket data={data} entite={entite} />,
  );

  return new NextResponse(toWebStream(stream), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${numero}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
