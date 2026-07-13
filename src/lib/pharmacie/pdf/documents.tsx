import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToStream,
  type DocumentProps,
} from "@react-pdf/renderer";

import { COLORS, fmtAriary, fmtDateTime } from "@/lib/reports/theme";
import type { VenteComplete } from "../sheets";
import type { Lang } from "@/lib/i18n";

/* ============================================================
   PHARMACIE — Documents de vente
   - Ticket de caisse : rouleau 80 mm (226,77 pt), hauteur dynamique
   - Facture : A4, en-tête légal + tableau + signature
   Les infos légales (NIF, STAT, adresse, téléphone) viennent de
   l'onglet `parametres` du Sheet (clés facture_*), avec fallbacks.
   ============================================================ */

export interface OrgInfo {
  nom: string;
  sousTitre: string;
  adresse: string;
  tel: string;
  email: string;
  nif: string;
  stat: string;
  piedDePage: string;
}

export function orgInfoFromParams(params: Map<string, string>): OrgInfo {
  return {
    nom: params.get("org_nom") || "La Vita Per Te",
    sousTitre:
      params.get("org_sous_titre") || "ONG-ODV Alfeo Corassori · Centre REX",
    adresse: params.get("facture_adresse") || "Fianarantsoa, Madagascar",
    tel: params.get("facture_tel") || "",
    email: params.get("facture_email") || "informatique.lavitaperte@gmail.com",
    nif: params.get("facture_nif") || "",
    stat: params.get("facture_stat") || "",
    piedDePage:
      params.get("facture_pied") ||
      "Misaotra betsaka ! Merci de votre confiance.",
  };
}

const L = {
  fr: {
    ticket: "TICKET DE CAISSE",
    facture: "FACTURE",
    date: "Date",
    caissier: "Caissier",
    client: "Client",
    clientComptant: "Client comptant",
    designation: "Désignation",
    qte: "Qté",
    pu: "P.U.",
    montant: "Montant",
    total: "TOTAL",
    paiement: "Paiement : espèces",
    nif: "NIF",
    stat: "STAT",
    emetteur: "Émetteur",
    factureNo: "Facture N°",
    signature: "Signature et cachet",
    annulee: "VENTE ANNULÉE",
  },
  it: {
    ticket: "SCONTRINO",
    facture: "FATTURA",
    date: "Data",
    caissier: "Cassiere",
    client: "Cliente",
    clientComptant: "Cliente al banco",
    designation: "Designazione",
    qte: "Qtà",
    pu: "P.U.",
    montant: "Importo",
    total: "TOTALE",
    paiement: "Pagamento : contanti",
    nif: "NIF",
    stat: "STAT",
    emetteur: "Emittente",
    factureNo: "Fattura N°",
    signature: "Firma e timbro",
    annulee: "VENDITA ANNULLATA",
  },
} as const;

/* ================= TICKET 80 mm ================= */

const TICKET_WIDTH = 226.77; // 80 mm
const tk = StyleSheet.create({
  page: { paddingVertical: 14, paddingHorizontal: 12, fontSize: 8.5, color: "#000" },
  center: { textAlign: "center" },
  orgName: { fontSize: 12, fontWeight: 700, textAlign: "center" },
  orgSub: { fontSize: 7.5, textAlign: "center", marginTop: 2, color: "#333" },
  hr: { borderBottomWidth: 1, borderBottomColor: "#000", borderStyle: "dashed", marginVertical: 6 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 1.5 },
  line: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  lineName: { flex: 1, paddingRight: 6 },
  lineAmount: { textAlign: "right", fontVariant: "tabular-nums" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#000",
  },
  totalText: { fontSize: 12, fontWeight: 700 },
  footer: { marginTop: 10, textAlign: "center", fontSize: 7.5, color: "#333" },
  cancel: {
    marginTop: 6,
    textAlign: "center",
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.critical,
  },
});

function TicketDoc({
  vente,
  org,
  lang,
}: {
  vente: VenteComplete;
  org: OrgInfo;
  lang: Lang;
}) {
  const t = L[lang];
  // Hauteur dynamique : entête ~120pt + 14pt par ligne + pied ~90pt
  const height = Math.max(300, 210 + vente.lignes.length * 14);

  return (
    <Document title={`Ticket ${vente.id}`}>
      <Page size={[TICKET_WIDTH, height]} style={tk.page}>
        <Text style={tk.orgName}>{org.nom.toUpperCase()}</Text>
        <Text style={tk.orgSub}>{org.sousTitre}</Text>
        <Text style={tk.orgSub}>{org.adresse}</Text>
        {org.tel ? <Text style={tk.orgSub}>Tél : {org.tel}</Text> : null}
        {org.nif ? (
          <Text style={tk.orgSub}>
            {t.nif} {org.nif}
            {org.stat ? ` · ${t.stat} ${org.stat}` : ""}
          </Text>
        ) : null}

        <View style={tk.hr} />
        <Text style={[tk.center, { fontWeight: 700 }]}>{t.ticket}</Text>
        <View style={{ marginTop: 4 }}>
          <View style={tk.meta}>
            <Text>{t.date}</Text>
            <Text>{fmtDateTime(vente.timestamp, lang)}</Text>
          </View>
          <View style={tk.meta}>
            <Text>N°</Text>
            <Text>{vente.id}</Text>
          </View>
          <View style={tk.meta}>
            <Text>{t.caissier}</Text>
            <Text>{vente.operateurEmail.split("@")[0]}</Text>
          </View>
          <View style={tk.meta}>
            <Text>{t.client}</Text>
            <Text>{vente.clientNom || t.clientComptant}</Text>
          </View>
        </View>

        <View style={tk.hr} />
        {vente.lignes.map((l, i) => (
          <View key={i} style={tk.line}>
            <Text style={tk.lineName}>
              {l.designation}
              {l.dosage ? ` ${l.dosage}` : ""} x{l.quantite}
            </Text>
            <Text style={tk.lineAmount}>{fmtAriary(l.sousTotal)}</Text>
          </View>
        ))}

        <View style={tk.totalRow}>
          <Text style={tk.totalText}>{t.total}</Text>
          <Text style={tk.totalText}>{fmtAriary(vente.total)}</Text>
        </View>
        <Text style={[tk.center, { marginTop: 4, fontSize: 8 }]}>{t.paiement}</Text>

        {vente.statut === "annulee" && <Text style={tk.cancel}>{t.annulee}</Text>}

        <Text style={tk.footer}>{org.piedDePage}</Text>
      </Page>
    </Document>
  );
}

/* ================= FACTURE A4 ================= */

const fa = StyleSheet.create({
  page: { padding: 46, fontSize: 10, color: COLORS.text },
  headerRow: { flexDirection: "row", justifyContent: "space-between" },
  brand: { fontSize: 18, fontWeight: 700, color: COLORS.brand },
  brandSub: { fontSize: 9, color: COLORS.textMuted, marginTop: 2 },
  facTitle: { fontSize: 22, fontWeight: 700, textAlign: "right" },
  facMeta: { fontSize: 9.5, textAlign: "right", marginTop: 3, color: COLORS.textMuted },
  blocks: { flexDirection: "row", gap: 16, marginTop: 26 },
  block: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 12,
  },
  blockTitle: {
    fontSize: 7.5,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: COLORS.textMuted,
    marginBottom: 5,
  },
  blockLine: { fontSize: 9.5, marginTop: 1.5 },
  table: { marginTop: 26 },
  thead: {
    flexDirection: "row",
    backgroundColor: COLORS.bgHeader,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.text,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  th: { fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  cDesignation: { flex: 5 },
  cQte: { flex: 1, textAlign: "right" },
  cPu: { flex: 2, textAlign: "right" },
  cMontant: { flex: 2, textAlign: "right" },
  totalBox: {
    marginTop: 14,
    alignSelf: "flex-end",
    flexDirection: "row",
    gap: 24,
    backgroundColor: COLORS.bgAccent,
    borderWidth: 1,
    borderColor: COLORS.brand,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  totalLabel: { fontSize: 12, fontWeight: 700 },
  totalValue: { fontSize: 12, fontWeight: 700, color: COLORS.brand },
  signRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 44 },
  signBox: { width: 200, textAlign: "center" },
  signLine: { borderTopWidth: 1, borderTopColor: COLORS.text, marginTop: 52, paddingTop: 5, fontSize: 8.5, color: COLORS.textMuted },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 46,
    right: 46,
    textAlign: "center",
    fontSize: 8,
    color: COLORS.textLight,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  cancelBanner: {
    marginTop: 16,
    textAlign: "center",
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.critical,
    borderWidth: 2,
    borderColor: COLORS.critical,
    borderRadius: 6,
    paddingVertical: 8,
  },
});

function FactureDoc({
  vente,
  org,
  lang,
}: {
  vente: VenteComplete;
  org: OrgInfo;
  lang: Lang;
}) {
  const t = L[lang];
  return (
    <Document title={`Facture ${vente.id}`}>
      <Page size="A4" style={fa.page}>
        {/* En-tête */}
        <View style={fa.headerRow}>
          <View>
            <Text style={fa.brand}>{org.nom}</Text>
            <Text style={fa.brandSub}>{org.sousTitre}</Text>
          </View>
          <View>
            <Text style={fa.facTitle}>{t.facture}</Text>
            <Text style={fa.facMeta}>
              {t.factureNo} {vente.id}
            </Text>
            <Text style={fa.facMeta}>
              {t.date} : {fmtDateTime(vente.timestamp, lang)}
            </Text>
          </View>
        </View>

        {vente.statut === "annulee" && (
          <Text style={fa.cancelBanner}>{t.annulee}</Text>
        )}

        {/* Blocs émetteur / client */}
        <View style={fa.blocks}>
          <View style={fa.block}>
            <Text style={fa.blockTitle}>{t.emetteur}</Text>
            <Text style={[fa.blockLine, { fontWeight: 700 }]}>{org.nom}</Text>
            <Text style={fa.blockLine}>{org.sousTitre}</Text>
            <Text style={fa.blockLine}>{org.adresse}</Text>
            {org.tel ? <Text style={fa.blockLine}>Tél : {org.tel}</Text> : null}
            <Text style={fa.blockLine}>{org.email}</Text>
            {org.nif ? (
              <Text style={fa.blockLine}>
                {t.nif} : {org.nif}
                {org.stat ? `  ·  ${t.stat} : ${org.stat}` : ""}
              </Text>
            ) : null}
          </View>
          <View style={fa.block}>
            <Text style={fa.blockTitle}>{t.client}</Text>
            <Text style={[fa.blockLine, { fontWeight: 700 }]}>
              {vente.clientNom || t.clientComptant}
            </Text>
            <Text style={fa.blockLine}>
              {t.caissier} : {vente.operateurEmail}
            </Text>
          </View>
        </View>

        {/* Tableau */}
        <View style={fa.table}>
          <View style={fa.thead}>
            <Text style={[fa.th, fa.cDesignation]}>{t.designation}</Text>
            <Text style={[fa.th, fa.cQte]}>{t.qte}</Text>
            <Text style={[fa.th, fa.cPu]}>{t.pu}</Text>
            <Text style={[fa.th, fa.cMontant]}>{t.montant}</Text>
          </View>
          {vente.lignes.map((l, i) => (
            <View key={i} style={fa.tr}>
              <Text style={fa.cDesignation}>
                {l.designation}
                {l.dosage ? ` — ${l.dosage}` : ""}
              </Text>
              <Text style={fa.cQte}>{l.quantite}</Text>
              <Text style={fa.cPu}>{fmtAriary(l.prixUnitaire)}</Text>
              <Text style={fa.cMontant}>{fmtAriary(l.sousTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={fa.totalBox}>
          <Text style={fa.totalLabel}>{t.total}</Text>
          <Text style={fa.totalValue}>{fmtAriary(vente.total)}</Text>
        </View>

        <View style={fa.signRow}>
          <View style={fa.signBox}>
            <Text style={fa.signLine}>{t.signature}</Text>
          </View>
        </View>

        <Text style={fa.footer}>
          {org.nom} · {org.adresse}
          {org.nif ? ` · ${t.nif} ${org.nif}` : ""} — {org.piedDePage}
        </Text>
      </Page>
    </Document>
  );
}

/* ================= Rendu ================= */

export async function renderVentePdf(
  doc: "ticket" | "facture",
  vente: VenteComplete,
  org: OrgInfo,
  lang: Lang,
): Promise<NodeJS.ReadableStream> {
  const element =
    doc === "ticket" ? (
      <TicketDoc vente={vente} org={org} lang={lang} />
    ) : (
      <FactureDoc vente={vente} org={org} lang={lang} />
    );
  // Même cast que src/lib/reports/index.ts (typage renderToStream)
  return await renderToStream(
    element as React.ReactElement<DocumentProps> as never,
  );
}
