import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  Image,
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
   Les infos légales (NIF, STAT, adresse, téléphone) ont pour défaut les
   coordonnées réelles du centre, surchargeables par l'onglet `parametres`.
   La TVA n'apparaît QUE si elle a été activée dans les paramètres (T7).
   ============================================================ */

/**
 * Logo embarqué en data-URI, lu une seule fois. On lit le fichier plutôt
 * que d'en dépendre par URL : un PDF ne doit pas partir chercher une image
 * sur le réseau au moment du rendu. En cas d'échec (fichier absent du
 * bundle), on renvoie null et le document s'imprime sans logo — jamais
 * d'erreur au comptoir pour une image manquante.
 */
let logoCache: string | null | undefined;
function logoDataUri(): string | null {
  if (logoCache !== undefined) return logoCache;
  try {
    const p = path.join(process.cwd(), "public", "logo", "lavitaperte.jpg");
    logoCache = `data:image/jpeg;base64,${readFileSync(p).toString("base64")}`;
  } catch {
    logoCache = null;
  }
  return logoCache;
}

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

/** Régime de TVA lu des paramètres (option réservée admin, T7). */
export interface FiscalInfo {
  tvaActive: boolean;
  tvaTaux: number;
}

export function orgInfoFromParams(params: Map<string, string>): OrgInfo {
  return {
    nom: params.get("org_nom") || "La Vita Per Te",
    sousTitre:
      params.get("org_sous_titre") || "ONG-ODV Alfeo Corassori · Centre REX",
    adresse: params.get("facture_adresse") || "IN 34 Ambatolahikisoa, Fianarantsoa",
    tel: params.get("facture_tel") || "032 11 515 04",
    email: params.get("facture_email") || "informatique.lavitaperte@gmail.com",
    nif: params.get("facture_nif") || "5001978624",
    stat: params.get("facture_stat") || "94111212015000569",
    piedDePage:
      params.get("facture_pied") ||
      "Misaotra betsaka ! Merci de votre confiance.",
  };
}

export function fiscalFromParams(params: Map<string, string>): FiscalInfo {
  return {
    tvaActive: params.get("tva_active") === "1",
    tvaTaux: Number(params.get("tva_taux") ?? "0") || 0,
  };
}

/**
 * Décompose un montant en HT / TVA / TTC. Le montant de référence est
 * TOUJOURS considéré TTC (c'est ce que le client paie) ; on en extrait la
 * part de TVA. Sans TVA active, HT = TTC et la part est nulle.
 */
function decomposerTva(montantTtc: number, fiscal: FiscalInfo) {
  if (!fiscal.tvaActive || fiscal.tvaTaux <= 0) {
    return { ht: montantTtc, tva: 0, ttc: montantTtc };
  }
  const ht = Math.round(montantTtc / (1 + fiscal.tvaTaux / 100));
  return { ht, tva: montantTtc - ht, ttc: montantTtc };
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
    priseEnCharge: "PRISE EN CHARGE",
    pecPar: "Pris en charge par",
    aPayer: "À payer",
    valeur: "Valeur des produits",
    especesRecu: "Espèces reçu",
    rendu: "Monnaie rendue",
    ht: "Montant HT",
    tva: "TVA",
    ttc: "Total TTC",
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
    priseEnCharge: "PRESA IN CARICO",
    pecPar: "Preso in carico da",
    aPayer: "Da pagare",
    valeur: "Valore dei prodotti",
    especesRecu: "Contanti ricevuti",
    rendu: "Resto reso",
    ht: "Imponibile",
    tva: "IVA",
    ttc: "Totale IVA incl.",
  },
} as const;

/* ================= TICKET 80 mm ================= */

const TICKET_WIDTH = 226.77; // 80 mm
const tk = StyleSheet.create({
  page: { paddingVertical: 14, paddingHorizontal: 12, fontSize: 8.5, color: "#000" },
  center: { textAlign: "center" },
  logo: { width: 46, height: 46, alignSelf: "center", marginBottom: 4 },
  orgName: { fontSize: 12, fontWeight: 700, textAlign: "center" },
  orgSub: { fontSize: 7.5, textAlign: "center", marginTop: 2, color: "#333" },
  hr: { borderBottomWidth: 1, borderBottomColor: "#000", borderStyle: "dashed", marginVertical: 6 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 1.5 },
  line: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  lineName: { flex: 1, paddingRight: 6 },
  lineAmount: { textAlign: "right", fontVariant: "tabular-nums" },
  subRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2, fontSize: 8 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#000",
  },
  totalText: { fontSize: 12, fontWeight: 700 },
  pecBox: {
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: "#000",
    borderStyle: "dashed",
    textAlign: "center",
  },
  pecTitle: { fontSize: 9.5, fontWeight: 700 },
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
  fiscal,
  lang,
  recu,
}: {
  vente: VenteComplete;
  org: OrgInfo;
  fiscal: FiscalInfo;
  lang: Lang;
  recu?: number;
}) {
  const t = L[lang];
  const logo = logoDataUri();
  const estPec = vente.typeVente === "pec";
  const valeur = estPec ? vente.valeurPec : vente.total;
  const { ht, tva } = decomposerTva(valeur, fiscal);
  const montreTva = fiscal.tvaActive && fiscal.tvaTaux > 0 && !estPec;
  const montreEspeces = !estPec && typeof recu === "number" && recu > 0;
  // Hauteur dynamique : socle + lignes + suppléments (PEC / TVA / espèces).
  const extra = (estPec ? 34 : 0) + (montreTva ? 24 : 0) + (montreEspeces ? 24 : 0);
  const height = Math.max(300, 230 + vente.lignes.length * 14 + extra);

  return (
    <Document title={`Ticket ${vente.id}`}>
      <Page size={[TICKET_WIDTH, height]} style={tk.page}>
        {logo ? <Image src={logo} style={tk.logo} /> : null}
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
            <Text>{estPec ? t.pecPar : t.client}</Text>
            <Text>{estPec ? vente.pecPayeur || "—" : vente.clientNom || t.clientComptant}</Text>
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

        {/* Décomposition TVA (seulement si activée, ventes payantes) */}
        {montreTva ? (
          <View style={{ marginTop: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: "#000" }}>
            <View style={tk.subRow}>
              <Text>{t.ht}</Text>
              <Text>{fmtAriary(ht)}</Text>
            </View>
            <View style={tk.subRow}>
              <Text>{t.tva} {fiscal.tvaTaux}%</Text>
              <Text>{fmtAriary(tva)}</Text>
            </View>
          </View>
        ) : null}

        {estPec ? (
          <>
            <View style={tk.subRow}>
              <Text>{t.valeur}</Text>
              <Text>{fmtAriary(valeur)}</Text>
            </View>
            <View style={tk.totalRow}>
              <Text style={tk.totalText}>{t.aPayer}</Text>
              <Text style={tk.totalText}>{fmtAriary(0)}</Text>
            </View>
            <View style={tk.pecBox}>
              <Text style={tk.pecTitle}>{t.priseEnCharge}</Text>
              <Text style={{ marginTop: 2 }}>{vente.pecPayeur || "—"}</Text>
            </View>
          </>
        ) : (
          <>
            <View style={tk.totalRow}>
              <Text style={tk.totalText}>{montreTva ? t.ttc : t.total}</Text>
              <Text style={tk.totalText}>{fmtAriary(vente.total)}</Text>
            </View>
            {montreEspeces ? (
              <>
                <View style={tk.subRow}>
                  <Text>{t.especesRecu}</Text>
                  <Text>{fmtAriary(recu!)}</Text>
                </View>
                <View style={tk.subRow}>
                  <Text>{t.rendu}</Text>
                  <Text>{fmtAriary(Math.max(0, recu! - vente.total))}</Text>
                </View>
              </>
            ) : (
              <Text style={[tk.center, { marginTop: 4, fontSize: 8 }]}>{t.paiement}</Text>
            )}
          </>
        )}

        {vente.statut === "annulee" && <Text style={tk.cancel}>{t.annulee}</Text>}

        <Text style={tk.footer}>{org.piedDePage}</Text>
      </Page>
    </Document>
  );
}

/* ================= FACTURE A4 ================= */

const fa = StyleSheet.create({
  page: { padding: 46, fontSize: 10, color: COLORS.text },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 52, height: 52 },
  brand: { fontSize: 18, fontWeight: 700, color: COLORS.brand },
  brandSub: { fontSize: 9, color: COLORS.textMuted, marginTop: 2 },
  facTitle: { fontSize: 22, fontWeight: 700, textAlign: "right" },
  facMeta: { fontSize: 9.5, textAlign: "right", marginTop: 3, color: COLORS.textMuted },
  pecTag: {
    marginTop: 6,
    alignSelf: "flex-end",
    fontSize: 9,
    fontWeight: 700,
    color: COLORS.brand,
    borderWidth: 1,
    borderColor: COLORS.brand,
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
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
  totals: { marginTop: 14, alignSelf: "flex-end", width: 240 },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 10,
  },
  totalBox: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
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
  fiscal,
  lang,
}: {
  vente: VenteComplete;
  org: OrgInfo;
  fiscal: FiscalInfo;
  lang: Lang;
}) {
  const t = L[lang];
  const logo = logoDataUri();
  const estPec = vente.typeVente === "pec";
  const valeur = estPec ? vente.valeurPec : vente.total;
  const { ht, tva } = decomposerTva(valeur, fiscal);
  const montreTva = fiscal.tvaActive && fiscal.tvaTaux > 0;

  return (
    <Document title={`Facture ${vente.id}`}>
      <Page size="A4" style={fa.page}>
        {/* En-tête */}
        <View style={fa.headerRow}>
          <View style={fa.brandRow}>
            {logo ? <Image src={logo} style={fa.logo} /> : null}
            <View>
              <Text style={fa.brand}>{org.nom}</Text>
              <Text style={fa.brandSub}>{org.sousTitre}</Text>
            </View>
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

        {estPec && <Text style={fa.pecTag}>{t.priseEnCharge}</Text>}

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
            <Text style={fa.blockTitle}>{estPec ? t.pecPar : t.client}</Text>
            <Text style={[fa.blockLine, { fontWeight: 700 }]}>
              {estPec
                ? vente.pecPayeur || "—"
                : vente.clientNom || t.clientComptant}
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

        {/* Totaux : décomposition TVA si active, puis total encadré. Pour une
            prise en charge, le total à payer est 0 et la valeur est indiquée. */}
        <View style={fa.totals}>
          {montreTva ? (
            <>
              <View style={fa.totalLine}>
                <Text>{t.ht}</Text>
                <Text>{fmtAriary(ht)}</Text>
              </View>
              <View style={fa.totalLine}>
                <Text>
                  {t.tva} {fiscal.tvaTaux}%
                </Text>
                <Text>{fmtAriary(tva)}</Text>
              </View>
            </>
          ) : null}
          {estPec ? (
            <>
              <View style={fa.totalLine}>
                <Text>{t.valeur}</Text>
                <Text>{fmtAriary(valeur)}</Text>
              </View>
              <View style={fa.totalBox}>
                <Text style={fa.totalLabel}>{t.aPayer}</Text>
                <Text style={fa.totalValue}>{fmtAriary(0)}</Text>
              </View>
            </>
          ) : (
            <View style={fa.totalBox}>
              <Text style={fa.totalLabel}>{montreTva ? t.ttc : t.total}</Text>
              <Text style={fa.totalValue}>{fmtAriary(vente.total)}</Text>
            </View>
          )}
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
  fiscal: FiscalInfo,
  lang: Lang,
  recu?: number,
): Promise<NodeJS.ReadableStream> {
  const element =
    doc === "ticket" ? (
      <TicketDoc vente={vente} org={org} fiscal={fiscal} lang={lang} recu={recu} />
    ) : (
      <FactureDoc vente={vente} org={org} fiscal={fiscal} lang={lang} />
    );
  // Même cast que src/lib/reports/index.ts (typage renderToStream)
  return await renderToStream(
    element as React.ReactElement<DocumentProps> as never,
  );
}
