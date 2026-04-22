import { Document, Page, View, Text } from "@react-pdf/renderer";
import { styles, fmtAriary, fmtDate } from "../theme";
import {
  ReportHeader,
  ReportFooter,
  TitleBlock,
  KpiGrid,
  ScoreBadge,
  StateBadge,
  EmptyState,
} from "../layout";
import { scoreObsolescence } from "@/lib/obsolescence";
import { MATERIAL_TYPE_LABELS, type MaterialType, type MaterialState } from "@/types";
import type { ReportContext } from "../types";
import type { ParSalleData } from "../fetchers";

/**
 * Rapport : fiche d'une salle (inventaire physique pour audit terrain).
 * Conçu pour être imprimé et coché à la main (case pour "Vérifié").
 */
export function ParSallePdf({
  data,
  ctx,
}: {
  data: ParSalleData;
  ctx: ReportContext;
}) {
  const title = ctx.lang === "it" ? "Scheda di sala" : "Fiche de salle";
  const subtitle = data.room
    ? `${data.site?.name ?? ""} — ${data.room.name} · ${fmtDate(ctx.generatedAt, ctx.lang)}`
    : ctx.lang === "it" ? "Nessuna sala specificata" : "Aucune salle spécifiée";

  const L = ctx.lang === "it"
    ? { count: "Dispositivi", value: "Valore totale", ref: "Rif.", designation: "Descrizione", type: "Tipo", brand: "Marca", state: "Stato", score: "Punt.", assigned: "Assegnato", verified: "Verificato" }
    : { count: "Matériels", value: "Valeur totale", ref: "Réf.", designation: "Désignation", type: "Type", brand: "Marque", state: "État", score: "Score", assigned: "Affecté", verified: "Vérifié" };

  const topType = Object.entries(data.byType)
    .sort((a, b) => b[1] - a[1])[0];
  const topTypeLabel = topType
    ? MATERIAL_TYPE_LABELS[topType[0] as MaterialType][ctx.lang]
    : "—";

  return (
    <Document title={title} author="La Vita Per Te">
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="SAL" />
        <ReportFooter lang={ctx.lang} />

        <TitleBlock title={title} subtitle={subtitle} />

        {!data.room ? (
          <EmptyState
            message={ctx.lang === "it" ? "Specifica una sala per generare la scheda." : "Spécifiez une salle pour générer la fiche."}
          />
        ) : (
          <>
            <KpiGrid
              kpis={[
                { label: L.count, value: String(data.materials.length) },
                { label: L.value, value: fmtAriary(data.totalValue) },
                { label: ctx.lang === "it" ? "Tipo principale" : "Type principal", value: topTypeLabel, hint: topType ? String(topType[1]) : "" },
              ]}
            />

            {data.materials.length === 0 ? (
              <EmptyState
                message={ctx.lang === "it" ? "Sala vuota." : "Salle vide."}
              />
            ) : (
              <>
                <View style={styles.tableRowHeader}>
                  <Text style={[styles.th, { width: "14%" }]}>{L.ref}</Text>
                  <Text style={[styles.th, { width: "24%" }]}>{L.designation}</Text>
                  <Text style={[styles.th, { width: "12%" }]}>{L.type}</Text>
                  <Text style={[styles.th, { width: "13%" }]}>{L.brand}</Text>
                  <Text style={[styles.th, { width: "11%" }]}>{L.state}</Text>
                  <Text style={[styles.th, { width: "6%", textAlign: "right" }]}>{L.score}</Text>
                  <Text style={[styles.th, { width: "12%" }]}>{L.assigned}</Text>
                  <Text style={[styles.th, { width: "8%", textAlign: "center" }]}>{L.verified}</Text>
                </View>

                {data.materials.map((m, i) => {
                  const { score } = scoreObsolescence(m);
                  return (
                    <View key={m.id} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]} wrap={false}>
                      <Text style={[styles.tdMono, { width: "14%" }]}>{m.ref}</Text>
                      <Text style={[styles.td, { width: "24%" }]}>{m.designation || "—"}</Text>
                      <Text style={[styles.td, { width: "12%" }]}>{MATERIAL_TYPE_LABELS[m.type][ctx.lang]}</Text>
                      <Text style={[styles.td, { width: "13%" }]}>{m.brand || "—"}</Text>
                      <View style={{ width: "11%", paddingHorizontal: 4 }}>
                        <StateBadge state={m.state} lang={ctx.lang} />
                      </View>
                      <View style={{ width: "6%", paddingHorizontal: 4, alignItems: "flex-end" }}>
                        <ScoreBadge score={score} />
                      </View>
                      <Text style={[styles.td, { width: "12%" }]}>{m.assignedTo || "—"}</Text>
                      <View style={{ width: "8%", paddingHorizontal: 4, alignItems: "center" }}>
                        <Text style={{ fontSize: 14, color: "#d1d5db" }}>☐</Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}
      </Page>
    </Document>
  );
}
