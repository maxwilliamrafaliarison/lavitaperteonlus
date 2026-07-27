import React from "react";
import { Document, Page, View, Text, renderToStream } from "@react-pdf/renderer";

import { styles, fmtDate, COLORS } from "@/lib/reports/theme";
import { ReportHeader, ReportFooter, TitleBlock, KpiGrid, SectionHeader, EmptyState } from "@/lib/reports/layout";
import type { ReportContext } from "@/lib/reports/types";
import { versHeures } from "@/lib/pointage/calcul";

import { fmtEcart, type EtatPlanifieData } from "./rapport";

function Th({ w, right, children }: { w: string; right?: boolean; children: React.ReactNode }) {
  return <Text style={[styles.th, { width: w }, right ? { textAlign: "right" } : {}]}>{children}</Text>;
}
function Td({ w, right, mono, couleur, children }: { w: string; right?: boolean; mono?: boolean; couleur?: string; children: React.ReactNode }) {
  return (
    <Text style={[mono ? styles.tdMono : styles.td, { width: w }, right ? { textAlign: "right" } : {}, couleur ? { color: couleur } : {}]}>
      {children}
    </Text>
  );
}

export function EtatPlanifieDoc({ data, ctx }: { data: EtatPlanifieData; ctx: ReportContext }) {
  const it = ctx.lang === "it";
  const l = {
    titre: it ? "Ore pianificate e realizzate" : "Heures planifiées et réalisées",
    sousTitre: it
      ? `Presenze · Centri REX e MIARAKA · Generato da ${ctx.generatedBy} il ${fmtDate(ctx.generatedAt, ctx.lang)}`
      : `Pointage · Centres REX et MIARAKA · Édité par ${ctx.generatedBy} le ${fmtDate(ctx.generatedAt, ctx.lang)}`,
    periode: it ? "Periodo" : "Période",
    planifie: it ? "Pianificato" : "Planifié",
    realise: it ? "Realizzato" : "Réalisé",
    ecart: it ? "Scarto" : "Écart",
    agents: it ? "Agenti" : "Agents",
    agent: it ? "Agente" : "Agent",
    site: it ? "Sede" : "Centre",
    jours: it ? "Giorni" : "Jours",
    retard: it ? "Ritardo" : "Retard",
    hs: it ? "Straord." : "H. sup.",
    anomalies: it ? "Anomalie" : "Anomalies",
    parSite: it ? "Ripartizione per sede" : "Répartition par centre",
    detail: it ? "Dettaglio per agente" : "Détail par agent",
  };

  return (
    <Document title={l.titre} author="La Vita Per Te">
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="PTG" />
        <ReportFooter lang={ctx.lang} />
        <TitleBlock title={l.titre} subtitle={l.sousTitre} />

        <View style={styles.contextBox}>
          <View style={styles.contextItem}>
            <Text style={styles.contextLabel}>{l.periode}</Text>
            <Text style={styles.contextValue}>{`${data.du} → ${data.au}`}</Text>
          </View>
          <View style={styles.contextItem}>
            <Text style={styles.contextLabel}>{l.agents}</Text>
            <Text style={styles.contextValue}>{String(data.nbAgents)}</Text>
          </View>
        </View>

        <KpiGrid
          kpis={[
            { label: l.planifie, value: versHeures(data.totalPlanifie), hint: `${data.nbAgentsPlanifies} ${l.agents.toLowerCase()}` },
            { label: l.realise, value: versHeures(data.totalRealise) },
            { label: l.ecart, value: fmtEcart(data.totalEcart) },
          ]}
        />

        {/* Avertissement de couverture : une conclusion tirée de données
            incomplètes serait pire qu'une absence de document. */}
        {data.couvertureDouteuse && (
          <View style={{ marginTop: 10, padding: 8, borderWidth: 1, borderColor: COLORS.warning, borderRadius: 4 }}>
            <Text style={{ fontSize: 8, color: COLORS.warning }}>
              {it
                ? "Attenzione: le ore realizzate sono molto inferiori a quelle pianificate. Le timbrature del periodo sembrano incomplete (gli export ZKAccess sono limitati a 500 righe). Verificare la raccolta prima di trarre conclusioni sull'assenteismo."
                : "Attention : les heures réalisées sont très inférieures aux heures planifiées. Les pointages de la période paraissent incomplets (les exports ZKAccess sont plafonnés à 500 lignes). Vérifiez la collecte avant d'en tirer une conclusion sur l'absentéisme."}
            </Text>
          </View>
        )}

        <SectionHeader title={l.parSite} />
        {data.parSite.length === 0 ? (
          <EmptyState message={it ? "Nessun dato." : "Aucune donnée."} />
        ) : (
          <>
            <View style={styles.tableRowHeader}>
              <Th w="34%">{l.site}</Th>
              <Th w="16%" right>{l.agents}</Th>
              <Th w="17%" right>{l.planifie}</Th>
              <Th w="17%" right>{l.realise}</Th>
              <Th w="16%" right>{l.ecart}</Th>
            </View>
            {data.parSite.map((s, i) => (
              <View key={s.site} style={[styles.tableRow, i % 2 ? styles.tableRowAlt : {}]}>
                <Td w="34%">{s.site}</Td>
                <Td w="16%" right mono>{String(s.agents)}</Td>
                <Td w="17%" right mono>{versHeures(s.planifie)}</Td>
                <Td w="17%" right mono>{versHeures(s.realise)}</Td>
                <Td w="16%" right mono couleur={s.realise >= s.planifie ? COLORS.ok : COLORS.warning}>
                  {fmtEcart(s.realise - s.planifie)}
                </Td>
              </View>
            ))}
          </>
        )}

        <SectionHeader title={l.detail} meta={`${data.lignes.length} ${l.agents.toLowerCase()}`} />
        {data.lignes.length === 0 ? (
          <EmptyState message={it ? "Nessun dato." : "Aucune donnée sur la période."} />
        ) : (
          <>
            <View style={styles.tableRowHeader} fixed>
              <Th w="27%">{l.agent}</Th>
              <Th w="11%">{l.site}</Th>
              <Th w="9%" right>{l.jours}</Th>
              <Th w="13%" right>{l.planifie}</Th>
              <Th w="13%" right>{l.realise}</Th>
              <Th w="13%" right>{l.ecart}</Th>
              <Th w="14%" right>{l.hs}</Th>
            </View>
            {data.lignes.map((r, i) => (
              <View key={r.agentId} style={[styles.tableRow, i % 2 ? styles.tableRowAlt : {}]} wrap={false}>
                <Td w="27%">
                  {r.nom}
                  {r.statut === "prestataire" ? " *" : ""}
                </Td>
                <Td w="11%">{r.site}</Td>
                <Td w="9%" right mono>{`${r.joursTravailles}/${r.joursPlanifies}`}</Td>
                <Td w="13%" right mono>{versHeures(r.minutesPlanifiees)}</Td>
                <Td w="13%" right mono>{versHeures(r.minutesRealisees)}</Td>
                <Td w="13%" right mono couleur={r.ecartMinutes >= 0 ? COLORS.ok : COLORS.warning}>
                  {fmtEcart(r.ecartMinutes)}
                </Td>
                <Td w="14%" right mono>{r.minutesSup > 0 ? versHeures(r.minutesSup) : "—"}</Td>
              </View>
            ))}
          </>
        )}

        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 7.5, color: COLORS.textMuted }}>
            {it
              ? "* Collaboratore esterno. Le ore straordinarie indicate sono proposte dal calcolo e dovute solo dopo approvazione del responsabile. Colonna Giorni: lavorati / pianificati."
              : "* Prestataire. Les heures supplémentaires indiquées sont proposées par le calcul et ne sont dues qu'après accord du responsable. Colonne Jours : travaillés / planifiés."}
          </Text>
          <Text style={{ fontSize: 7.5, color: COLORS.textMuted, marginTop: 3 }}>
            {it
              ? "Documento conforme all'obbligo di misurazione oggettiva del tempo di lavoro (CGUE C-55/18)."
              : "Document établi conformément à l'obligation de mesure objective du temps de travail (CJUE C-55/18, 14 mai 2019)."}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export function renderEtatPlanifieRealise(data: EtatPlanifieData, ctx: ReportContext) {
  return renderToStream(<EtatPlanifieDoc data={data} ctx={ctx} />);
}
