import { Document, Page, View, Text } from "@react-pdf/renderer";
import { styles, fmtDate, fmtDateTime } from "../theme";
import {
  ReportHeader,
  ReportFooter,
  TitleBlock,
  ContextBox,
  KpiGrid,
  EmptyState,
} from "../layout";
import type { ReportContext } from "../types";
import type { MouvementsData } from "../fetchers";
import type { MovementType } from "@/types";

const MOVEMENT_LABELS: Record<MovementType, { fr: string; it: string }> = {
  creation: { fr: "Création", it: "Creazione" },
  transfert_site: { fr: "Transf. site", it: "Trasf. sito" },
  transfert_salle: { fr: "Transf. salle", it: "Trasf. sala" },
  transfert_utilisateur: { fr: "Transf. affect.", it: "Trasf. assegn." },
  reparation: { fr: "Réparation", it: "Riparazione" },
  mise_au_rebut: { fr: "Rebut", it: "Smaltimento" },
  restauration: { fr: "Restauration", it: "Ripristino" },
};

export function MouvementsPdf({
  data,
  ctx,
  filtersSummary,
}: {
  data: MouvementsData;
  ctx: ReportContext;
  filtersSummary: { label: string; value: string }[];
}) {
  const title = ctx.lang === "it" ? "Movimenti nel periodo" : "Mouvements sur période";
  const subtitle =
    ctx.lang === "it"
      ? `${data.movements.length} eventi · Generato da ${ctx.generatedBy} il ${fmtDate(ctx.generatedAt, "it")}`
      : `${data.movements.length} événements · Édité par ${ctx.generatedBy} le ${fmtDate(ctx.generatedAt, "fr")}`;

  const L = ctx.lang === "it"
    ? { date: "Data", type: "Tipo", material: "Dispositivo", from: "Da", to: "A", reason: "Motivo", by: "Da", events: "Eventi", period: "Periodo" }
    : { date: "Date", type: "Type", material: "Matériel", from: "De", to: "Vers", reason: "Motif", by: "Par", events: "Événements", period: "Période" };

  const siteMap = new Map(data.sites.map((s) => [s.id, s]));
  const roomMap = new Map(data.rooms.map((r) => [r.id, r]));
  const materialMap = new Map(data.materials.map((m) => [m.id, m]));
  const userMap = new Map(data.users.map((u) => [u.id, u]));

  const formatLocation = (siteId?: string, roomId?: string, assigned?: string) => {
    const parts: string[] = [];
    if (siteId) parts.push(siteMap.get(siteId)?.code || siteId);
    if (roomId) parts.push(roomMap.get(roomId)?.name || roomId);
    if (assigned) parts.push(assigned);
    return parts.join(" · ") || "—";
  };

  const periodLabel = data.dateFrom || data.dateTo
    ? `${data.dateFrom ? fmtDate(data.dateFrom, ctx.lang) : "…"} → ${data.dateTo ? fmtDate(data.dateTo, ctx.lang) : "…"}`
    : (ctx.lang === "it" ? "Tutto il periodo" : "Toute la période");

  return (
    <Document title={title} author="La Vita Per Te">
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="MVT" />
        <ReportFooter lang={ctx.lang} />

        <TitleBlock title={title} subtitle={subtitle} />

        <ContextBox
          items={[
            { label: L.period, value: periodLabel },
            ...filtersSummary,
          ]}
        />

        <KpiGrid
          kpis={[
            { label: L.events, value: String(data.movements.length) },
            {
              label: ctx.lang === "it" ? "Trasferimenti" : "Transferts",
              value: String(
                (data.countByType["transfert_site"] || 0) +
                (data.countByType["transfert_salle"] || 0) +
                (data.countByType["transfert_utilisateur"] || 0),
              ),
            },
            {
              label: ctx.lang === "it" ? "Creazioni" : "Créations",
              value: String(data.countByType["creation"] || 0),
            },
          ]}
        />

        {data.movements.length === 0 ? (
          <EmptyState
            message={
              ctx.lang === "it"
                ? "Nessun movimento nel periodo selezionato."
                : "Aucun mouvement dans la période sélectionnée."
            }
          />
        ) : (
          <>
            <View style={styles.tableRowHeader}>
              <Text style={[styles.th, { width: "13%" }]}>{L.date}</Text>
              <Text style={[styles.th, { width: "12%" }]}>{L.type}</Text>
              <Text style={[styles.th, { width: "22%" }]}>{L.material}</Text>
              <Text style={[styles.th, { width: "16%" }]}>{L.from}</Text>
              <Text style={[styles.th, { width: "16%" }]}>{L.to}</Text>
              <Text style={[styles.th, { width: "11%" }]}>{L.by}</Text>
              <Text style={[styles.th, { width: "10%" }]}>{L.reason}</Text>
            </View>

            {data.movements.map((m, i) => {
              const mat = materialMap.get(m.materialId);
              const user = userMap.get(m.byUserId);
              return (
                <View key={m.id} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]} wrap={false}>
                  <Text style={[styles.tdMono, { width: "13%" }]}>{fmtDateTime(m.date, ctx.lang)}</Text>
                  <Text style={[styles.td, { width: "12%" }]}>
                    {MOVEMENT_LABELS[m.type]?.[ctx.lang] || m.type}
                  </Text>
                  <Text style={[styles.td, { width: "22%" }]}>
                    {mat?.designation || mat?.ref || m.materialId.slice(-8)}
                  </Text>
                  <Text style={[styles.td, { width: "16%", fontSize: 7 }]}>
                    {m.type === "creation" ? "—" : formatLocation(m.fromSiteId, m.fromRoomId, m.fromAssignedTo)}
                  </Text>
                  <Text style={[styles.td, { width: "16%", fontSize: 7 }]}>
                    {formatLocation(m.toSiteId, m.toRoomId, m.toAssignedTo)}
                  </Text>
                  <Text style={[styles.td, { width: "11%" }]}>
                    {user?.name || "—"}
                  </Text>
                  <Text style={[styles.td, { width: "10%", fontSize: 7, fontStyle: "italic" }]}>
                    {m.reason || "—"}
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
