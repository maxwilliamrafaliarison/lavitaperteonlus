import { Document, Page, View, Text } from "@react-pdf/renderer";
import { styles, fmtAriary, fmtDate } from "../theme";
import {
  ReportHeader,
  ReportFooter,
  TitleBlock,
  ContextBox,
  KpiGrid,
  SectionHeader,
  StateBadge,
  EmptyState,
} from "../layout";
import { MATERIAL_TYPE_LABELS } from "@/types";
import type { ReportContext } from "../types";
import type { ParUtilisateurData } from "../fetchers";

export function ParUtilisateurPdf({
  data,
  ctx,
  filtersSummary,
  groupedByService,
}: {
  data: ParUtilisateurData;
  ctx: ReportContext;
  filtersSummary: { label: string; value: string }[];
  groupedByService: boolean;
}) {
  const title = ctx.lang === "it"
    ? (groupedByService ? "Dispositivi per reparto" : "Dispositivi per persona")
    : (groupedByService ? "Matériels par service" : "Matériels par personne");
  const subtitle = ctx.lang === "it"
    ? `Assegnazioni · Generato da ${ctx.generatedBy} il ${fmtDate(ctx.generatedAt, "it")}`
    : `Affectations · Édité par ${ctx.generatedBy} le ${fmtDate(ctx.generatedAt, "fr")}`;

  const L = ctx.lang === "it"
    ? { total: "Totale dispositivi", groups: groupedByService ? "Reparti" : "Persone", value: "Valore cumulato", ref: "Rif.", designation: "Descrizione", type: "Tipo", state: "Stato", site: "Sito", room: "Sala" }
    : { total: "Total matériels", groups: groupedByService ? "Services" : "Personnes", value: "Valeur cumulée", ref: "Réf.", designation: "Désignation", type: "Type", state: "État", site: "Site", room: "Salle" };

  const siteMap = new Map(data.sites.map((s) => [s.id, s]));
  const roomMap = new Map(data.rooms.map((r) => [r.id, r]));
  const totalValue = data.groups.reduce((s, g) => s + g.totalValue, 0);

  return (
    <Document title={title} author="La Vita Per Te">
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="USR" />
        <ReportFooter lang={ctx.lang} />

        <TitleBlock title={title} subtitle={subtitle} />

        <ContextBox items={filtersSummary} />

        <KpiGrid
          kpis={[
            { label: L.total, value: String(data.totalCount) },
            { label: L.groups, value: String(data.groups.length) },
            { label: L.value, value: fmtAriary(totalValue) },
          ]}
        />

        {data.groups.length === 0 ? (
          <EmptyState
            message={ctx.lang === "it" ? "Nessuna corrispondenza." : "Aucun résultat."}
          />
        ) : (
          data.groups.map((g) => (
            <View key={g.key}>
              <SectionHeader
                title={g.key}
                meta={
                  ctx.lang === "it"
                    ? `${g.materials.length} dispositivi · ${fmtAriary(g.totalValue)}`
                    : `${g.materials.length} matériels · ${fmtAriary(g.totalValue)}`
                }
              />

              <View style={styles.tableRowHeader}>
                <Text style={[styles.th, { width: "15%" }]}>{L.ref}</Text>
                <Text style={[styles.th, { width: "30%" }]}>{L.designation}</Text>
                <Text style={[styles.th, { width: "15%" }]}>{L.type}</Text>
                <Text style={[styles.th, { width: "10%" }]}>{L.site}</Text>
                <Text style={[styles.th, { width: "18%" }]}>{L.room}</Text>
                <Text style={[styles.th, { width: "12%" }]}>{L.state}</Text>
              </View>

              {g.materials.map((m, i) => (
                <View key={m.id} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]} wrap={false}>
                  <Text style={[styles.tdMono, { width: "15%" }]}>{m.ref}</Text>
                  <Text style={[styles.td, { width: "30%" }]}>{m.designation || "—"}</Text>
                  <Text style={[styles.td, { width: "15%" }]}>{MATERIAL_TYPE_LABELS[m.type][ctx.lang]}</Text>
                  <Text style={[styles.td, { width: "10%" }]}>{siteMap.get(m.siteId)?.code || "—"}</Text>
                  <Text style={[styles.td, { width: "18%" }]}>{roomMap.get(m.roomId)?.name || "—"}</Text>
                  <View style={{ width: "12%", paddingHorizontal: 4 }}>
                    <StateBadge state={m.state} lang={ctx.lang} />
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </Page>
    </Document>
  );
}
