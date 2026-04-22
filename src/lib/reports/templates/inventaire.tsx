import { Document, Page, View, Text } from "@react-pdf/renderer";
import { styles, fmtDate } from "../theme";
import {
  ReportHeader,
  ReportFooter,
  TitleBlock,
  ContextBox,
  KpiGrid,
  SectionHeader,
  ScoreBadge,
  StateBadge,
  EmptyState,
} from "../layout";
import { scoreObsolescence } from "@/lib/obsolescence";
import { MATERIAL_TYPE_LABELS } from "@/types";
import type { ReportContext } from "../types";
import type { InventaireData } from "../fetchers";

/**
 * Rapport : Inventaire complet
 * Structure : KPIs → groupé par site → groupé par salle → table détaillée
 */
export function InventairePdf({
  data,
  ctx,
  filtersSummary,
}: {
  data: InventaireData;
  ctx: ReportContext;
  filtersSummary: { label: string; value: string }[];
}) {
  const title = ctx.lang === "it" ? "Inventario completo" : "Inventaire complet";
  const subtitleText = ctx.lang === "it"
    ? `Parco informatico · Generato da ${ctx.generatedBy} il ${fmtDate(ctx.generatedAt, ctx.lang)}`
    : `Parc informatique · Édité par ${ctx.generatedBy} le ${fmtDate(ctx.generatedAt, ctx.lang)}`;

  const kpiLabels = ctx.lang === "it"
    ? { shown: "Mostrati", total: "Totale parco", sites: "Siti", rooms: "Sale" }
    : { shown: "Affichés", total: "Parc total", sites: "Sites", rooms: "Salles" };

  const roomCount = data.grouped.reduce((s, g) => s + g.rooms.length, 0);

  const thLabels = ctx.lang === "it"
    ? { ref: "Rif.", designation: "Descrizione", type: "Tipo", marque: "Marca", state: "Stato", score: "Punt.", assigned: "Assegnato" }
    : { ref: "Réf.", designation: "Désignation", type: "Type", marque: "Marque", state: "État", score: "Score", assigned: "Affecté" };

  return (
    <Document title={title} author="La Vita Per Te">
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="INV" />
        <ReportFooter lang={ctx.lang} />

        <TitleBlock title={title} subtitle={subtitleText} />

        <ContextBox items={filtersSummary} />

        <KpiGrid
          kpis={[
            { label: kpiLabels.shown, value: String(data.shownCount), hint: `/ ${data.totalCount} ${kpiLabels.total.toLowerCase()}` },
            { label: kpiLabels.sites, value: String(data.grouped.length) },
            { label: kpiLabels.rooms, value: String(roomCount) },
          ]}
        />

        {data.grouped.length === 0 ? (
          <EmptyState
            message={ctx.lang === "it" ? "Nessun dispositivo corrisponde ai filtri." : "Aucun matériel ne correspond aux filtres."}
          />
        ) : (
          data.grouped.map((group, gi) => (
            <View key={group.site.id}>
              {group.rooms.map((roomGroup, ri) => (
                <View key={roomGroup.room.id} wrap={false /* garde la salle sur la même page si possible */}>
                  <SectionHeader
                    title={`${group.site.code} — ${roomGroup.room.name}`}
                    meta={
                      ctx.lang === "it"
                        ? `${roomGroup.materials.length} dispositivi`
                        : `${roomGroup.materials.length} matériels`
                    }
                  />

                  {/* Table header */}
                  <View style={styles.tableRowHeader}>
                    <Text style={[styles.th, { width: "16%" }]}>{thLabels.ref}</Text>
                    <Text style={[styles.th, { width: "28%" }]}>{thLabels.designation}</Text>
                    <Text style={[styles.th, { width: "14%" }]}>{thLabels.type}</Text>
                    <Text style={[styles.th, { width: "14%" }]}>{thLabels.marque}</Text>
                    <Text style={[styles.th, { width: "11%" }]}>{thLabels.state}</Text>
                    <Text style={[styles.th, { width: "7%", textAlign: "right" }]}>{thLabels.score}</Text>
                    <Text style={[styles.th, { width: "10%" }]}>{thLabels.assigned}</Text>
                  </View>

                  {roomGroup.materials.map((m, mi) => {
                    const { score } = scoreObsolescence(m);
                    const rowStyle = [styles.tableRow, mi % 2 === 1 ? styles.tableRowAlt : {}];
                    return (
                      <View key={m.id} style={rowStyle}>
                        <Text style={[styles.tdMono, { width: "16%" }]}>{m.ref}</Text>
                        <Text style={[styles.td, { width: "28%" }]}>
                          {m.designation || "—"}
                        </Text>
                        <Text style={[styles.td, { width: "14%" }]}>
                          {MATERIAL_TYPE_LABELS[m.type][ctx.lang]}
                        </Text>
                        <Text style={[styles.td, { width: "14%" }]}>
                          {m.brand || "—"}
                        </Text>
                        <View style={{ width: "11%", paddingHorizontal: 4 }}>
                          <StateBadge state={m.state} lang={ctx.lang} />
                        </View>
                        <View style={{ width: "7%", paddingHorizontal: 4, alignItems: "flex-end" }}>
                          <ScoreBadge score={score} />
                        </View>
                        <Text style={[styles.td, { width: "10%" }]}>
                          {m.assignedTo || "—"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          ))
        )}
      </Page>
    </Document>
  );
}
