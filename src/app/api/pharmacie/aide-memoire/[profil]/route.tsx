import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { Document, Page, View, Text, renderToStream } from "@react-pdf/renderer";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { styles, COLORS } from "@/lib/reports/theme";
import { ReportHeader, ReportFooter, TitleBlock, SectionHeader } from "@/lib/reports/layout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/* ============================================================
   AIDE-MÉMOIRE A4 — à imprimer et afficher au comptoir
   ============================================================
   Une page par profil. Généré par le même moteur que les rapports : même
   charte, et toujours à jour du contenu — un PDF statique dans le dépôt
   serait déjà périmé à la deuxième évolution de l'application.
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

function Bloc({ titre, lignes }: { titre: string; lignes: string[] }) {
  return (
    <View style={{ marginBottom: 10 }} wrap={false}>
      <SectionHeader title={titre} />
      {lignes.map((l, i) => (
        <Text key={i} style={{ fontSize: 9.5, lineHeight: 1.5, color: COLORS.text }}>
          {l.startsWith("!") ? "" : `${i + 1}.  `}
          {l.replace(/^!/, "")}
        </Text>
      ))}
    </View>
  );
}

const CONTENU: Record<string, { titre: string; blocs: Array<{ titre: string; lignes: string[] }> }> = {
  dispensatrice: {
    titre: "Aide-mémoire — Vente au comptoir",
    blocs: [
      {
        titre: "Faire une vente",
        lignes: [
          "Menu « Nouvelle vente » (bouton rouge).",
          "Taper les premières lettres du produit, le choisir dans la liste.",
          "Saisir la quantité — produit à pastille = vendu à l'UNITÉ, pas à la boîte.",
          "« Encaisser », puis remettre le ticket au client.",
          "!Prise en charge (PEC) : choisir « Prise en charge » et l'entité qui paie — le client ne paie rien.",
        ],
      },
      {
        titre: "Réception de produits",
        lignes: [
          "Menu « Réception » dès l'arrivée des produits.",
          "Saisir le produit, la quantité, le numéro de lot et la date de péremption.",
          "Le stock se met à jour tout seul — ne jamais le corriger « de tête ».",
        ],
      },
      {
        titre: "Si l'application ne répond plus",
        lignes: [
          "Continuer à servir : noter chaque vente au CARNET PAPIER (produit, quantité, montant, heure).",
          "Ne rien enregistrer deux fois — vérifier dans « Ventes » au retour du réseau.",
          "Prévenir l'informatique : informatique.lavitaperte@gmail.com. Rien n'est perdu.",
        ],
      },
      {
        titre: "Les pastilles du menu",
        lignes: [
          "!ROUGE = produits en rupture de stock.  AMBRE = produits périmant sous 90 jours.",
          "!Un produit périmé ne se vend pas : le mettre de côté et le signaler.",
        ],
      },
    ],
  },
  direction: {
    titre: "Aide-mémoire — Direction",
    blocs: [
      {
        titre: "Suivre l'activité",
        lignes: [
          "Tableau de bord Pharmacie : encaissé du jour, ruptures, péremptions.",
          "« Rapports » : ventes, stock, à commander, péremptions, laboratoire galénique — PDF à la demande.",
          "Bilan mensuel professionnel : « Rapports » puis « Bilan mensuel », ou réception automatique par courriel en fin de mois.",
          "Chaque soir, un rapport de fin de journée arrive par courriel (ventes, alertes).",
        ],
      },
      {
        titre: "Les personnes et les accès",
        lignes: [
          "Dispensatrices : accès Pharmacie uniquement (vente, stock, rapports).",
          "Direction : toutes les applications, dont Pointage (présence, états mensuels).",
          "Un nouveau compte se crée depuis Logistique → Utilisateurs (administrateur) ; le mot de passe initial doit être changé à la première connexion.",
        ],
      },
      {
        titre: "Points de vigilance",
        lignes: [
          "Une vente annulée reste tracée (qui, quand) — le stock revient automatiquement.",
          "Les chiffres des rapports proviennent des mêmes données que l'écran : un écart entre les deux doit être signalé, pas corrigé à la main.",
          "En cas de panne réseau au comptoir : carnet papier, puis ressaisie — consigne affichée dans l'application (menu Aide).",
        ],
      },
    ],
  },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ profil: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(session.user.role, "app:pharmacie")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const { profil } = await params;
  const contenu = CONTENU[profil];
  if (!contenu) return NextResponse.json({ error: "Profil inconnu" }, { status: 404 });

  const doc = (
    <Document title={contenu.titre} author="La Vita Per Te">
      <Page size="A4" style={styles.page}>
        <ReportHeader
          ctx={{ lang: "fr", generatedBy: "La Vita Per Te", generatedAt: new Date().toISOString() }}
          reportNumber="AIDE"
        />
        <ReportFooter lang="fr" />
        <TitleBlock
          title={contenu.titre}
          subtitle="Pharmacie · Centre REX · à afficher au comptoir"
        />
        {contenu.blocs.map((b) => (
          <Bloc key={b.titre} titre={b.titre} lignes={b.lignes} />
        ))}
        <Text style={{ marginTop: 8, fontSize: 8, color: COLORS.textMuted }}>
          Support : informatique.lavitaperte@gmail.com · Document généré par l&apos;application —
          la version en ligne (menu Aide) fait foi.
        </Text>
      </Page>
    </Document>
  );

  const stream = await renderToStream(doc);
  return new NextResponse(toWebStream(stream), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="aide-memoire-${profil}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
