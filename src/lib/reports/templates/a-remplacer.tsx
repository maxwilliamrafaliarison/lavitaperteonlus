import { Document, Page, View, Text } from "@react-pdf/renderer";
import { styles, fmtDate } from "../theme";
import {
  ReportHeader,
  ReportFooter,
  TitleBlock,
  ContextBox,
  KpiGrid,
  ScoreBadge,
  StateBadge,
  EmptyState,
} from "../layout";
import { MATERIAL_TYPE_LABELS } from "@/types";
import type { ReportContext } from "../types";
import type { ARemplacerData } from "../fetchers";

/**
 * Rapport : matériels à remplacer en priorité (score ≤ threshold).
 * Inclut la liste des raisons (âge, OS obsolète, panne…) pour justifier
 * le remplacement auprès de la direction.
 */
export function ARemplacerPdf({
  data,
  ctx,
  filtersSummary,
}: {
  data: ARemplacerData;
  ctx: ReportContext;
  filtersSummary: { label: string; value: string }[];
}) {
  const title =
    ctx.lang === "it"
      ? "Dispositivi da sostituire"
      : "Matériels à remplacer en priorité";
  const subtitle =
    ctx.lang === "it"
      ? `Punteggio ≤ ${data.threshold} · Generato da ${ctx.generatedBy} il ${fmtDate(ctx.generatedAt, "it")}`
      : `Score ≤ ${data.threshold} · Édité par ${ctx.generatedBy} le ${fmtDate(ctx.generatedAt, "fr")}`;

  const labels = ctx.lang === "it"
    ? { critical: "Critici", total: "Parco totale", percent: "Percentuale", ref: "Rif.", designation: "Descrizione", type: "Tipo", site: "Sito", salle: "Sala", state: "Stato", score: "Punt.", reasons: "Motivi" }
    : { critical: "À remplacer", total: "Parc total", percent: "Proportion", ref: "Réf.", designation: "Désignation", type: "Type", site: "Site", salle: "Salle", state: "État", score: "Score", reasons: "Raisons" };

  const percent = data.totalCount > 0 ? Math.round((data.materials.length / data.totalCount) * 100) : 0;

  return (
    <Document title={title} author="La Vita Per Te">
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="CRI" />
        <ReportFooter lang={ctx.lang} />

        <TitleBlock title={title} subtitle={subtitle} />

        <ContextBox items={filtersSummary} />

        <KpiGrid
          kpis={[
            { label: labels.critical, value: String(data.materials.length) },
            { label: labels.total, value: String(data.totalCount) },
            { label: labels.percent, value: `${percent}%` },
          ]}
        />

        {data.materials.length === 0 ? (
          <EmptyState
            message={
              ctx.lang === "it"
                ? "Nessun dispositivo critico — bravo al parco informatico !"
                : "Aucun matériel critique — bravo au parc informatique !"
            }
          />
        ) : (
          <>
            <View style={styles.tableRowHeader}>
              <Text style={[styles.th, { width: "13%" }]}>{labels.ref}</Text>
              <Text style={[styles.th, { width: "24%" }]}>{labels.designation}</Text>
              <Text style={[styles.th, { width: "11%" }]}>{labels.type}</Text>
              <Text style={[styles.th, { width: "10%" }]}>{labels.site}</Text>
              <Text style={[styles.th, { width: "12%" }]}>{labels.salle}</Text>
              <Text style={[styles.th, { width: "9%" }]}>{labels.state}</Text>
              <Text style={[styles.th, { width: "6%", textAlign: "right" }]}>{labels.score}</Text>
              <Text style={[styles.th, { width: "15%" }]}>{labels.reasons}</Text>
            </View>

            {data.materials.map((x, i) => {
              const rowStyle = [styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}];
              return (
                <View key={x.material.id} style={rowStyle} wrap={false}>
                  <Text style={[styles.tdMono, { width: "13%" }]}>{x.material.ref}</Text>
                  <Text style={[styles.td, { width: "24%" }]}>
                    {x.material.designation || "—"}
                  </Text>
                  <Text style={[styles.td, { width: "11%" }]}>
                    {MATERIAL_TYPE_LABELS[x.material.type][ctx.lang]}
                  </Text>
                  <Text style={[styles.td, { width: "10%" }]}>
                    {x.site?.code || "—"}
                  </Text>
                  <Text style={[styles.td, { width: "12%" }]}>
                    {x.room?.name || "—"}
                  </Text>
                  <View style={{ width: "9%", paddingHorizontal: 4 }}>
                    <StateBadge state={x.material.state} lang={ctx.lang} />
                  </View>
                  <View style={{ width: "6%", paddingHorizontal: 4, alignItems: "flex-end" }}>
                    <ScoreBadge score={x.score} />
                  </View>
                  <Text style={[styles.td, { width: "15%", fontSize: 7 }]}>
                    {x.reasons.slice(0, 2).join(" · ") || "—"}
                  </Text>
                </View>
              );
            })}
          </>
        )}
      </Page>
    </Document>
  );
}
