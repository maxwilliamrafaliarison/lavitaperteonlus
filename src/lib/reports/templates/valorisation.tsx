import { Document, Page, View, Text } from "@react-pdf/renderer";
import { styles, fmtAriary, fmtDate } from "../theme";
import {
  ReportHeader,
  ReportFooter,
  TitleBlock,
  ContextBox,
  KpiGrid,
  SectionHeader,
  EmptyState,
} from "../layout";
import { MATERIAL_TYPE_LABELS, type MaterialType } from "@/types";
import type { ReportContext } from "../types";
import type { ValorisationData } from "../fetchers";

export function ValorisationPdf({
  data,
  ctx,
  filtersSummary,
}: {
  data: ValorisationData;
  ctx: ReportContext;
  filtersSummary: { label: string; value: string }[];
}) {
  const title =
    ctx.lang === "it"
      ? "Valutazione & budget di rinnovo"
      : "Valorisation & budget de renouvellement";
  const subtitle =
    ctx.lang === "it"
      ? `Sintesi finanziaria · Generato da ${ctx.generatedBy} il ${fmtDate(ctx.generatedAt, "it")}`
      : `Synthèse financière · Édité par ${ctx.generatedBy} le ${fmtDate(ctx.generatedAt, "fr")}`;

  const L = ctx.lang === "it"
    ? {
        totalValue: "Valore totale",
        totalValueHint: "Costo d'acquisto cumulato",
        matCount: "Dispositivi",
        critical: "Da sostituire",
        budget: "Budget stimato",
        budgetHint: "Per sostituire i critici",
        byTypeTitle: "Per tipo",
        bySiteTitle: "Per sito",
        type: "Tipo",
        count: "Quantità",
        value: "Valore totale",
        share: "Quota",
        site: "Sito",
        criticalCount: "Critici",
        renewalCost: "Costo rinnovo",
      }
    : {
        totalValue: "Valeur totale",
        totalValueHint: "Prix d'achat cumulé",
        matCount: "Matériels",
        critical: "À remplacer",
        budget: "Budget estimé",
        budgetHint: "Pour remplacer les critiques",
        byTypeTitle: "Par type",
        bySiteTitle: "Par site",
        type: "Type",
        count: "Quantité",
        value: "Valeur totale",
        share: "Part",
        site: "Site",
        criticalCount: "Critiques",
        renewalCost: "Coût de renouvellement",
      };

  return (
    <Document title={title} author="La Vita Per Te">
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="VAL" />
        <ReportFooter lang={ctx.lang} />

        <TitleBlock title={title} subtitle={subtitle} />

        <ContextBox items={filtersSummary} />

        <KpiGrid
          kpis={[
            {
              label: L.totalValue,
              value: fmtAriary(data.totalPurchasePrice),
              hint: `${data.materials.length} ${L.matCount.toLowerCase()}`,
            },
            {
              label: L.critical,
              value: String(data.renewalBudget.criticalCount),
              hint:
                data.materials.length > 0
                  ? `${Math.round((data.renewalBudget.criticalCount / data.materials.length) * 100)}%`
                  : "—",
            },
            {
              label: L.budget,
              value: fmtAriary(data.renewalBudget.estimatedCost),
              hint: L.budgetHint,
            },
          ]}
        />

        {data.materials.length === 0 ? (
          <EmptyState
            message={ctx.lang === "it" ? "Nessun dispositivo." : "Aucun matériel."}
          />
        ) : (
          <>
            {/* Par type */}
            <SectionHeader title={L.byTypeTitle} />
            <View style={styles.tableRowHeader}>
              <Text style={[styles.th, { width: "45%" }]}>{L.type}</Text>
              <Text style={[styles.th, { width: "15%", textAlign: "right" }]}>{L.count}</Text>
              <Text style={[styles.th, { width: "25%", textAlign: "right" }]}>{L.value}</Text>
              <Text style={[styles.th, { width: "15%", textAlign: "right" }]}>{L.share}</Text>
            </View>
            {data.byType.map((row, i) => {
              const pct = data.totalPurchasePrice > 0
                ? Math.round((row.totalPrice / data.totalPurchasePrice) * 100)
                : 0;
              return (
                <View key={row.type} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
                  <Text style={[styles.td, { width: "45%" }]}>
                    {MATERIAL_TYPE_LABELS[row.type as MaterialType][ctx.lang]}
                  </Text>
                  <Text style={[styles.tdNum, { width: "15%" }]}>{row.count}</Text>
                  <Text style={[styles.tdNum, { width: "25%" }]}>{fmtAriary(row.totalPrice)}</Text>
                  <Text style={[styles.tdNum, { width: "15%" }]}>{pct}%</Text>
                </View>
              );
            })}

            {/* Par site */}
            <SectionHeader title={L.bySiteTitle} />
            <View style={styles.tableRowHeader}>
              <Text style={[styles.th, { width: "30%" }]}>{L.site}</Text>
              <Text style={[styles.th, { width: "13%", textAlign: "right" }]}>{L.count}</Text>
              <Text style={[styles.th, { width: "22%", textAlign: "right" }]}>{L.value}</Text>
              <Text style={[styles.th, { width: "12%", textAlign: "right" }]}>{L.criticalCount}</Text>
              <Text style={[styles.th, { width: "23%", textAlign: "right" }]}>{L.renewalCost}</Text>
            </View>
            {data.bySite.map((row, i) => (
              <View key={row.site.id} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
                <Text style={[styles.td, { width: "30%" }]}>{row.site.name}</Text>
                <Text style={[styles.tdNum, { width: "13%" }]}>{row.count}</Text>
                <Text style={[styles.tdNum, { width: "22%" }]}>{fmtAriary(row.totalPrice)}</Text>
                <Text style={[styles.tdNum, { width: "12%" }]}>{row.critical}</Text>
                <Text style={[styles.tdNum, { width: "23%" }]}>{fmtAriary(row.criticalCost)}</Text>
              </View>
            ))}
          </>
        )}
      </Page>
    </Document>
  );
}
