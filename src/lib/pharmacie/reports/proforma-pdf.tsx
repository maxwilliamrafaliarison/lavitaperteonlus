import React from "react";
import { Document, Page, View, Text, Font } from "@react-pdf/renderer";

/* Pas de césure : sur un ticket de 80 mm, la coupure automatique tranchait
   « CORASSORI » en « CORAS-SORI ». Un nom propre ne se coupe pas, et un
   document que l'on remet au patient doit se lire sans buter. */
Font.registerHyphenationCallback((mot) => [mot]);

import { styles, COLORS, fmtAriary } from "@/lib/reports/theme";
import { ReportHeader, ReportFooter, TitleBlock } from "@/lib/reports/layout";
import { type EntiteLegale, MENTION_DEVISE } from "@/lib/pharmacie/entite";

/* ============================================================
   DEVIS (PROFORMA) — une estimation, jamais une vente
   ============================================================

   Remis au patient qui vient demander le prix d'une ordonnance avant de
   décider. Rien n'est encaissé, rien ne sort du stock, aucune quantité
   n'est réservée.

   Tout le soin du document porte sur cette distinction. Un proforma qui
   ressemble à une facture finit par être présenté comme une preuve de
   paiement, ou brandi trois mois plus tard pour exiger un prix qui a
   changé. D'où trois garde-fous visibles : le mot DEVIS en tête, un
   bandeau qui énonce ce que la pièce n'est pas, et une date de validité
   au-delà de laquelle elle ne vaut plus rien.

   La série de numérotation est distincte de celle des factures : mêler
   les deux ferait apparaître des trous dans la série comptable, puisque
   la plupart des devis ne deviennent jamais des ventes.
   ============================================================ */

export interface LigneProforma {
  designation: string;
  /** Dénomination commune, dosage — ce qui identifie le médicament. */
  detail: string;
  quantite: number;
  /** « boîte », « comprimé »… l'unité facturée. */
  unite: string;
  prixUnitaire: number;
  total: number;
}

export interface DonneesProforma {
  numero: string;
  emisLe: string;
  valideJusquau: string;
  client: string;
  lignes: LigneProforma[];
  total: number;
  emisPar: string;
}

function jour(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Indian/Antananarivo",
  });
}

export function ProformaPdf({
  data,
  entite,
}: {
  data: DonneesProforma;
  entite: EntiteLegale;
}) {
  return (
    <Document title={`${data.numero} — Devis`} author={entite.denomination}>
      <Page size="A4" style={[styles.page, { paddingTop: 56, paddingBottom: 44 }]}>
        <ReportHeader
          ctx={{ lang: "fr", generatedBy: "Pharmacie", generatedAt: data.emisLe }}
          reportNumber={data.numero}
        />
        <ReportFooter lang="fr" />

        <TitleBlock
          title="Devis — proforma"
          /* L'établissement porte déjà le mot « Centre » : le préfixer une
             seconde fois donnait « Centre Centre REX ». */
          subtitle={`N° ${data.numero} · Pharmacie · ${entite.etablissement.split("·")[0]?.trim() || "Centre REX"}`}
        />

        {/* Identification de l'émetteur */}
        <View style={{ marginBottom: 8, paddingBottom: 6, borderBottom: `0.5 solid ${COLORS.border}` }}>
          <Text style={{ fontSize: 10, fontWeight: 700 }}>{entite.denomination}</Text>
          <Text style={{ fontSize: 8.5, color: COLORS.textMuted, marginTop: 1.5 }}>
            {entite.formeJuridique}
          </Text>
          <Text style={{ fontSize: 8.5, color: COLORS.textMuted, marginTop: 1.5 }}>
            Adresse : {entite.siegeSocial}
            {entite.codeFiscal ? ` · Code fiscal ${entite.codeFiscal}` : ""}
          </Text>
          <Text style={{ fontSize: 8.5, color: COLORS.textMuted, marginTop: 1.5 }}>
            {entite.etablissement}
            {entite.nif ? ` · NIF ${entite.nif}` : ""}
            {entite.stat ? ` · STAT ${entite.stat}` : ""}
          </Text>
        </View>

        {/* Ce que la pièce N'EST PAS — dit avant les chiffres, pas après */}
        <View
          style={{
            marginBottom: 10,
            padding: 8,
            backgroundColor: COLORS.warningSoft,
            borderLeft: `3 solid ${COLORS.warning}`,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: 700, color: COLORS.warning }}>
            DEVIS — NE VAUT PAS FACTURE
          </Text>
          <Text style={{ fontSize: 8.5, color: COLORS.text, marginTop: 2, lineHeight: 1.4 }}>
            Estimation de prix remise à titre indicatif. Aucun paiement n&apos;a été reçu, aucune
            marchandise n&apos;a été délivrée et aucune quantité n&apos;est réservée. Les produits
            restent disponibles à la vente pour d&apos;autres patients.
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 16, marginBottom: 10 }}>
          <Info label="Établi le" valeur={jour(data.emisLe)} />
          <Info label="Valable jusqu'au" valeur={jour(data.valideJusquau)} accent />
          <Info label="Client" valeur={data.client || "—"} />
          <Info label="Établi par" valeur={data.emisPar} />
        </View>

        {/* ---- Le détail chiffré ---- */}
        <View style={{ flexDirection: "row", backgroundColor: COLORS.bgHeader, paddingVertical: 5, paddingHorizontal: 6 }}>
          <Cellule w="44%" gras>Produit</Cellule>
          <Cellule w="16%" gras right>Quantité</Cellule>
          <Cellule w="20%" gras right>Prix unitaire</Cellule>
          <Cellule w="20%" gras right>Total</Cellule>
        </View>
        {data.lignes.map((l, i) => (
          <View
            key={i}
            style={{
              flexDirection: "row",
              paddingVertical: 4,
              paddingHorizontal: 6,
              borderBottom: `0.5 solid ${COLORS.borderLight}`,
            }}
          >
            <View style={{ width: "44%" }}>
              <Text style={{ fontSize: 9 }}>{l.designation}</Text>
              {l.detail ? (
                <Text style={{ fontSize: 7.5, color: COLORS.textMuted }}>{l.detail}</Text>
              ) : null}
            </View>
            <Cellule w="16%" right>{`${l.quantite} ${l.unite}`}</Cellule>
            <Cellule w="20%" right>{fmtAriary(l.prixUnitaire)}</Cellule>
            <Cellule w="20%" right>{fmtAriary(l.total)}</Cellule>
          </View>
        ))}

        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            marginTop: 8,
            paddingTop: 6,
            borderTop: `1 solid ${COLORS.text}`,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: 700, marginRight: 12 }}>Total estimé</Text>
          <Text style={{ fontSize: 13, fontWeight: 700, color: COLORS.brand }}>
            {fmtAriary(data.total)}
          </Text>
        </View>

        {/* ---- Mentions ---- */}
        <View style={{ marginTop: 18, paddingTop: 8, borderTop: `0.5 solid ${COLORS.border}` }}>
          <Text style={{ fontSize: 7.5, color: COLORS.textLight, lineHeight: 1.5 }}>
            {MENTION_DEVISE}
          </Text>
          <Text style={{ fontSize: 7.5, color: COLORS.textLight, lineHeight: 1.5, marginTop: 2 }}>
            Prix susceptibles de varier après la date de validité, notamment en fonction des
            réapprovisionnements. Sous réserve de disponibilité au moment de la délivrance.
          </Text>
          <Text style={{ fontSize: 7.5, color: COLORS.textLight, lineHeight: 1.5, marginTop: 2 }}>
            Ce devis ne constitue ni une facture, ni un reçu, ni une preuve de paiement. Il ne
            donne lieu à aucune écriture comptable tant qu&apos;il n&apos;est pas transformé en
            vente au comptoir.
          </Text>
          {entite.incomplete && (
            <Text style={{ fontSize: 7.5, color: COLORS.critical, lineHeight: 1.5, marginTop: 4 }}>
              Mentions d&apos;immatriculation incomplètes ({entite.manquants.join(", ")}) : à
              compléter dans les paramètres de l&apos;application.
            </Text>
          )}
        </View>
      </Page>
    </Document>
  );
}

/* ============================================================
   TICKET PROFORMA — 80 mm, imprimante de comptoir
   ============================================================
   Même valeur que la version A4 : le format n'a aucune incidence, un
   devis n'étant pas une pièce comptable. Ce qui compte est de ne pas
   pouvoir être pris pour un reçu, et les mentions qui l'assurent tiennent
   sur un rouleau. C'est le geste rapide du comptoir : le patient repart
   avec son prix en dix secondes, sans mobiliser l'imprimante A4.
   ============================================================ */

const LARGEUR_TICKET = 226.77; // 80 mm

export function ProformaTicket({
  data,
  entite,
}: {
  data: DonneesProforma;
  entite: EntiteLegale;
}) {
  // Hauteur ajustée au contenu : un rouleau ne connaît pas la pagination.
  const hauteur = Math.max(300, 250 + data.lignes.length * 22);

  const tk = {
    page: { paddingHorizontal: 10, paddingVertical: 12, fontFamily: "Helvetica", fontSize: 7.5 },
    centre: { textAlign: "center" as const },
    sep: { borderTop: `0.5 solid ${COLORS.border}`, marginVertical: 4 },
  };

  return (
    <Document title={`${data.numero} — Devis`} author={entite.denomination}>
      <Page size={[LARGEUR_TICKET, hauteur]} style={tk.page}>
        <Text style={{ ...tk.centre, fontSize: 8.5, fontWeight: 700, lineHeight: 1.2 }}>
          {entite.denomination.toUpperCase()}
        </Text>
        <Text style={{ ...tk.centre, fontSize: 6.5, color: COLORS.textMuted, marginTop: 1 }}>
          {entite.etablissement}
        </Text>
        {entite.codeFiscal && entite.codeFiscal !== "à renseigner" ? (
          <Text style={{ ...tk.centre, fontSize: 6.5, color: COLORS.textMuted }}>
            C.F. {entite.codeFiscal}
          </Text>
        ) : null}
        {entite.nif || entite.stat ? (
          <Text style={{ ...tk.centre, fontSize: 6.5, color: COLORS.textMuted }}>
            {entite.nif ? `NIF ${entite.nif}` : ""}
            {entite.nif && entite.stat ? " · " : ""}
            {entite.stat ? `STAT ${entite.stat}` : ""}
          </Text>
        ) : null}

        <View style={tk.sep} />

        {/* La nature du document, en tête et en grand : c'est ce qui
            distingue ce ticket d'un reçu de caisse. */}
        <Text style={{ ...tk.centre, fontSize: 11, fontWeight: 700, color: COLORS.warning }}>
          DEVIS — PROFORMA
        </Text>
        <Text style={{ ...tk.centre, fontSize: 7, fontWeight: 700, marginTop: 1 }}>
          NE VAUT PAS FACTURE
        </Text>
        <Text style={{ ...tk.centre, fontSize: 6.5, color: COLORS.textMuted, marginTop: 2, lineHeight: 1.35 }}>
          Aucun paiement reçu · aucune marchandise délivrée · aucune quantité réservée
        </Text>

        <View style={tk.sep} />

        <Text style={{ fontSize: 7 }}>N° {data.numero}</Text>
        <Text style={{ fontSize: 7 }}>Établi le {jour(data.emisLe)}</Text>
        <Text style={{ fontSize: 7, fontWeight: 700, color: COLORS.warning }}>
          Valable jusqu&apos;au {jour(data.valideJusquau)}
        </Text>
        {data.client ? <Text style={{ fontSize: 7 }}>Client : {data.client}</Text> : null}
        <Text style={{ fontSize: 7 }}>Par : {data.emisPar}</Text>

        <View style={tk.sep} />

        {data.lignes.map((l, i) => (
          <View key={i} style={{ marginBottom: 3 }}>
            <Text style={{ fontSize: 7.5 }}>{l.designation}</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 7, color: COLORS.textMuted }}>
                {l.quantite} {l.unite} × {fmtAriary(l.prixUnitaire)}
              </Text>
              <Text style={{ fontSize: 7.5 }}>{fmtAriary(l.total)}</Text>
            </View>
          </View>
        ))}

        <View style={{ borderTop: `1 solid ${COLORS.text}`, marginTop: 3, paddingTop: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 9, fontWeight: 700 }}>TOTAL ESTIMÉ</Text>
            <Text style={{ fontSize: 10, fontWeight: 700, color: COLORS.brand }}>
              {fmtAriary(data.total)}
            </Text>
          </View>
        </View>

        <View style={tk.sep} />
        <Text style={{ fontSize: 6, color: COLORS.textMuted, lineHeight: 1.4 }}>
          Montants en ariary (MGA). Prix susceptibles de varier après la date de validité.
          Sous réserve de disponibilité. Ce document ne constitue ni une facture, ni un reçu,
          ni une preuve de paiement.
        </Text>
      </Page>
    </Document>
  );
}

function Info({ label, valeur, accent }: { label: string; valeur: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 7.5, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 9.5, fontWeight: accent ? 700 : 400, color: accent ? COLORS.warning : COLORS.text, marginTop: 1.5 }}>
        {valeur}
      </Text>
    </View>
  );
}

function Cellule({
  w,
  children,
  gras,
  right,
}: {
  w: string;
  children: React.ReactNode;
  gras?: boolean;
  right?: boolean;
}) {
  return (
    <Text
      style={{
        width: w,
        fontSize: gras ? 8 : 9,
        fontWeight: gras ? 700 : 400,
        color: gras ? COLORS.textMuted : COLORS.text,
        textAlign: right ? "right" : "left",
        textTransform: gras ? "uppercase" : "none",
      }}
    >
      {children}
    </Text>
  );
}
