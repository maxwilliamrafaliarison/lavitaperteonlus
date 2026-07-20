import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  renderToStream,
  type DocumentProps,
} from "@react-pdf/renderer";

import { styles, fmtDate, fmtAriary, COLORS } from "@/lib/reports/theme";
import {
  ReportHeader,
  ReportFooter,
  TitleBlock,
  KpiGrid,
  SectionHeader,
  EmptyState,
} from "@/lib/reports/layout";
import type { ReportContext } from "@/lib/reports/types";
import type { Lang } from "@/lib/i18n";

import type {
  PharmaRapportType,
  RapportData,
  VentesData,
  StockData,
  CommandeData,
  ExpirationData,
  RuptureData,
} from "./data";

const TITRES: Record<PharmaRapportType, { fr: string; it: string }> = {
  ventes: { fr: "Rapport des ventes", it: "Rapporto delle vendite" },
  stock: { fr: "État du stock", it: "Stato dello stock" },
  a_commander: { fr: "À commander", it: "Da ordinare" },
  expiration: { fr: "Péremptions", it: "Scadenze" },
  rupture: { fr: "Ruptures de stock", it: "Rotture di stock" },
};

export function titreRapport(type: PharmaRapportType, lang: Lang): string {
  return TITRES[type][lang];
}

function sousTitre(ctx: ReportContext): string {
  return ctx.lang === "it"
    ? `Farmacia · Centro REX · Generato da ${ctx.generatedBy} il ${fmtDate(ctx.generatedAt, ctx.lang)}`
    : `Pharmacie · Centre REX · Édité par ${ctx.generatedBy} le ${fmtDate(ctx.generatedAt, ctx.lang)}`;
}

/* Cellule d'en-tête / de ligne avec largeur fixée. */
function Th({ w, right, children }: { w: string; right?: boolean; children: React.ReactNode }) {
  return <Text style={[styles.th, { width: w }, right ? { textAlign: "right" } : {}]}>{children}</Text>;
}
function Td({ w, right, mono, children }: { w: string; right?: boolean; mono?: boolean; children: React.ReactNode }) {
  return (
    <Text style={[mono ? styles.tdMono : styles.td, { width: w }, right ? { textAlign: "right" } : {}]}>
      {children}
    </Text>
  );
}

function Vide({ lang }: { lang: Lang }) {
  return (
    <EmptyState message={lang === "it" ? "Nessun dato per questo rapporto." : "Aucune donnée pour ce rapport."} />
  );
}

/* ================= VENTES ================= */

function VentesDoc({ data, ctx }: { data: VentesData; ctx: ReportContext }) {
  const it = ctx.lang === "it";
  const l = {
    cash: it ? "Vendite in contanti" : "Ventes comptant",
    pec: it ? "Prese in carico (0 Ar)" : "Prises en charge (0 Ar)",
    encaisse: it ? "Incassato" : "Encaissé",
    valeurPec: it ? "Valore PEC" : "Valeur PEC",
    nb: it ? "Vendite" : "Ventes",
    date: "Date",
    tiers: it ? "Cliente / Ente" : "Client / Entité",
    art: it ? "Art." : "Art.",
    montant: it ? "Importo" : "Montant",
    periode: it ? "Periodo" : "Période",
    payeur: it ? "Preso in carico da" : "Pris en charge par",
  };
  const periode = `${data.from || "…"} → ${data.to || "…"}`;

  const Section = ({ titre, lignes, montantLabel }: { titre: string; lignes: VentesData["cash"]; montantLabel: string }) => (
    <View>
      <SectionHeader title={titre} meta={`${lignes.length} · ${fmtAriary(lignes.reduce((s, x) => s + x.montant, 0))}`} />
      {lignes.length === 0 ? (
        <Vide lang={ctx.lang} />
      ) : (
        <>
          <View style={styles.tableRowHeader}>
            <Th w="16%">{l.date}</Th>
            <Th w="24%">N°</Th>
            <Th w="34%">{l.tiers}</Th>
            <Th w="10%" right>{l.art}</Th>
            <Th w="16%" right>{montantLabel}</Th>
          </View>
          {lignes.map((v, i) => (
            <View key={v.id} style={[styles.tableRow, i % 2 ? styles.tableRowAlt : {}]}>
              <Td w="16%" mono>{fmtDate(v.date, ctx.lang)}</Td>
              <Td w="24%" mono>{v.id}</Td>
              <Td w="34%">{v.tiers}</Td>
              <Td w="10%" right>{String(v.articles)}</Td>
              <Td w="16%" right mono>{fmtAriary(v.montant)}</Td>
            </View>
          ))}
        </>
      )}
    </View>
  );

  return (
    <Document title={titreRapport("ventes", ctx.lang)} author="La Vita Per Te">
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="VTE" />
        <ReportFooter lang={ctx.lang} />
        <TitleBlock title={titreRapport("ventes", ctx.lang)} subtitle={sousTitre(ctx)} />
        <View style={[styles.contextBox]}>
          <View style={styles.contextItem}>
            <Text style={styles.contextLabel}>{l.periode}</Text>
            <Text style={styles.contextValue}>{periode}</Text>
          </View>
        </View>
        <KpiGrid
          kpis={[
            { label: l.encaisse, value: fmtAriary(data.totalCash), hint: `${data.cash.length} ${l.nb.toLowerCase()}` },
            { label: l.valeurPec, value: fmtAriary(data.valeurPec), hint: `${data.pec.length} PEC` },
            { label: l.nb, value: String(data.cash.length + data.pec.length) },
          ]}
        />
        <Section titre={l.cash} lignes={data.cash} montantLabel={l.encaisse} />
        <View style={{ height: 10 }} />
        <Section titre={l.pec} lignes={data.pec} montantLabel={l.valeurPec} />
      </Page>
    </Document>
  );
}

/* ================= STOCK ================= */

function StockDoc({ data, ctx }: { data: StockData; ctx: ReportContext }) {
  const it = ctx.lang === "it";
  const l = {
    produit: it ? "Prodotto" : "Produit",
    fourn: it ? "Fornitore" : "Fournisseur",
    stock: "Stock",
    seuil: it ? "Soglia" : "Seuil",
    pu: it ? "P.U." : "P.U.",
    valeur: it ? "Valore" : "Valeur",
    nb: it ? "Prodotti" : "Produits",
    total: it ? "Valore totale" : "Valeur totale",
  };
  return (
    <Document title={titreRapport("stock", ctx.lang)} author="La Vita Per Te">
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="STK" />
        <ReportFooter lang={ctx.lang} />
        <TitleBlock title={titreRapport("stock", ctx.lang)} subtitle={sousTitre(ctx)} />
        <KpiGrid
          kpis={[
            { label: l.nb, value: String(data.nbProduits) },
            { label: l.total, value: fmtAriary(data.valeurTotale) },
          ]}
        />
        {data.lignes.length === 0 ? (
          <Vide lang={ctx.lang} />
        ) : (
          <>
            <View style={styles.tableRowHeader}>
              <Th w="34%">{l.produit}</Th>
              <Th w="22%">{l.fourn}</Th>
              <Th w="13%" right>{l.stock}</Th>
              <Th w="10%" right>{l.seuil}</Th>
              <Th w="21%" right>{l.valeur}</Th>
            </View>
            {data.lignes.map((r, i) => (
              <View key={i} style={[styles.tableRow, i % 2 ? styles.tableRowAlt : {}]}>
                <Td w="34%">{r.designation}</Td>
                <Td w="22%">{r.fournisseur}</Td>
                <Td w="13%" right mono>{r.stock}</Td>
                <Td w="10%" right mono>{r.seuil}</Td>
                <Td w="21%" right mono>{r.valeurLabel}</Td>
              </View>
            ))}
          </>
        )}
      </Page>
    </Document>
  );
}

/* ================= À COMMANDER ================= */

function CommandeDoc({ data, ctx }: { data: CommandeData; ctx: ReportContext }) {
  const it = ctx.lang === "it";
  const l = {
    produit: it ? "Prodotto" : "Produit",
    fourn: it ? "Fornitore" : "Fournisseur",
    stock: "Stock",
    seuil: it ? "Soglia" : "Seuil",
    cmd: it ? "Da ordinare" : "À commander",
    nb: it ? "Da riordinare" : "À réapprovisionner",
  };
  return (
    <Document title={titreRapport("a_commander", ctx.lang)} author="La Vita Per Te">
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="CMD" />
        <ReportFooter lang={ctx.lang} />
        <TitleBlock title={titreRapport("a_commander", ctx.lang)} subtitle={sousTitre(ctx)} />
        <KpiGrid kpis={[{ label: l.nb, value: String(data.lignes.length) }]} />
        {data.lignes.length === 0 ? (
          <EmptyState message={it ? "Nessun prodotto sotto soglia. ✓" : "Aucun produit sous le seuil. ✓"} />
        ) : (
          <>
            <View style={styles.tableRowHeader}>
              <Th w="36%">{l.produit}</Th>
              <Th w="24%">{l.fourn}</Th>
              <Th w="14%" right>{l.stock}</Th>
              <Th w="12%" right>{l.seuil}</Th>
              <Th w="14%" right>{l.cmd}</Th>
            </View>
            {data.lignes.map((r, i) => (
              <View key={i} style={[styles.tableRow, i % 2 ? styles.tableRowAlt : {}]}>
                <Td w="36%">{r.designation}</Td>
                <Td w="24%">{r.fournisseur}</Td>
                <Td w="14%" right mono>{r.stock}</Td>
                <Td w="12%" right mono>{r.seuil}</Td>
                <Text style={[styles.td, { width: "14%", textAlign: "right", color: COLORS.brand, fontWeight: 700 }]}>
                  {r.aCommander}
                </Text>
              </View>
            ))}
          </>
        )}
      </Page>
    </Document>
  );
}

/* ================= EXPIRATION ================= */

function ExpirationDoc({ data, ctx }: { data: ExpirationData; ctx: ReportContext }) {
  const it = ctx.lang === "it";
  const l = {
    produit: it ? "Prodotto" : "Produit",
    perem: it ? "Scadenza" : "Péremption",
    jours: it ? "Giorni" : "Jours",
    stock: "Stock",
    perimes: it ? "Scaduti" : "Périmés",
    bientot: it ? "In scadenza (≤ 90 g)" : "Périment sous 90 jours",
  };
  const Table = ({ lignes }: { lignes: ExpirationData["perimes"] }) => (
    <>
      <View style={styles.tableRowHeader}>
        <Th w="46%">{l.produit}</Th>
        <Th w="22%">{l.perem}</Th>
        <Th w="16%" right>{l.jours}</Th>
        <Th w="16%" right>{l.stock}</Th>
      </View>
      {lignes.map((r, i) => (
        <View key={i} style={[styles.tableRow, i % 2 ? styles.tableRowAlt : {}]}>
          <Td w="46%">{r.designation}</Td>
          <Td w="22%" mono>{r.peremption}</Td>
          <Text style={[styles.tdMono, { width: "16%", textAlign: "right", color: r.perime ? COLORS.critical : COLORS.warning }]}>
            {r.jours === null ? "—" : r.perime ? `${r.jours}` : `J-${r.jours}`}
          </Text>
          <Td w="16%" right mono>{r.stock}</Td>
        </View>
      ))}
    </>
  );
  return (
    <Document title={titreRapport("expiration", ctx.lang)} author="La Vita Per Te">
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="EXP" />
        <ReportFooter lang={ctx.lang} />
        <TitleBlock title={titreRapport("expiration", ctx.lang)} subtitle={sousTitre(ctx)} />
        <KpiGrid
          kpis={[
            { label: l.perimes, value: String(data.perimes.length) },
            { label: l.bientot, value: String(data.bientot.length) },
          ]}
        />
        {data.perimes.length === 0 && data.bientot.length === 0 ? (
          <EmptyState message={it ? "Nessuna scadenza imminente. ✓" : "Aucune péremption imminente. ✓"} />
        ) : (
          <>
            {data.perimes.length > 0 && (
              <View>
                <SectionHeader title={l.perimes} meta={String(data.perimes.length)} />
                <Table lignes={data.perimes} />
                <View style={{ height: 10 }} />
              </View>
            )}
            {data.bientot.length > 0 && (
              <View>
                <SectionHeader title={l.bientot} meta={String(data.bientot.length)} />
                <Table lignes={data.bientot} />
              </View>
            )}
          </>
        )}
      </Page>
    </Document>
  );
}

/* ================= RUPTURE ================= */

function RuptureDoc({ data, ctx }: { data: RuptureData; ctx: ReportContext }) {
  const it = ctx.lang === "it";
  const l = {
    produit: it ? "Prodotto" : "Produit",
    fourn: it ? "Fornitore" : "Fournisseur",
    seuil: it ? "Soglia" : "Seuil",
    nb: it ? "In rottura" : "En rupture",
  };
  return (
    <Document title={titreRapport("rupture", ctx.lang)} author="La Vita Per Te">
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="RUP" />
        <ReportFooter lang={ctx.lang} />
        <TitleBlock title={titreRapport("rupture", ctx.lang)} subtitle={sousTitre(ctx)} />
        <KpiGrid kpis={[{ label: l.nb, value: String(data.lignes.length) }]} />
        {data.lignes.length === 0 ? (
          <EmptyState message={it ? "Nessuna rottura di stock. ✓" : "Aucune rupture de stock. ✓"} />
        ) : (
          <>
            <View style={styles.tableRowHeader}>
              <Th w="50%">{l.produit}</Th>
              <Th w="34%">{l.fourn}</Th>
              <Th w="16%" right>{l.seuil}</Th>
            </View>
            {data.lignes.map((r, i) => (
              <View key={i} style={[styles.tableRow, i % 2 ? styles.tableRowAlt : {}]}>
                <Td w="50%">{r.designation}</Td>
                <Td w="34%">{r.fournisseur}</Td>
                <Td w="16%" right mono>{r.seuil}</Td>
              </View>
            ))}
          </>
        )}
      </Page>
    </Document>
  );
}

/* ================= Rendu ================= */

export async function renderPharmacieRapport(
  data: RapportData,
  ctx: ReportContext,
): Promise<NodeJS.ReadableStream> {
  let element: React.ReactElement;
  switch (data.type) {
    case "ventes":
      element = <VentesDoc data={data} ctx={ctx} />;
      break;
    case "stock":
      element = <StockDoc data={data} ctx={ctx} />;
      break;
    case "a_commander":
      element = <CommandeDoc data={data} ctx={ctx} />;
      break;
    case "expiration":
      element = <ExpirationDoc data={data} ctx={ctx} />;
      break;
    case "rupture":
      element = <RuptureDoc data={data} ctx={ctx} />;
      break;
  }
  return await renderToStream(
    element as React.ReactElement<DocumentProps> as never,
  );
}
