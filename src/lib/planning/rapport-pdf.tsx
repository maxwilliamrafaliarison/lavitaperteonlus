import React from "react";
import { Document, Page, View, Text, renderToStream } from "@react-pdf/renderer";

import { styles, fmtDate, COLORS } from "@/lib/reports/theme";
import { ReportHeader, ReportFooter, TitleBlock, KpiGrid, SectionHeader, EmptyState } from "@/lib/reports/layout";
import type { ReportContext } from "@/lib/reports/types";
import { versHeures } from "@/lib/pointage/calcul";

import { fmtEcart, type EtatPlanifieRealise, type LigneEtat } from "./rapport";

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

function EtatDoc({ data, ctx }: { data: EtatPlanifieRealise; ctx: ReportContext }) {
  const it = ctx.lang === "it";
  const l = {
    titre: it ? "Ore pianificate e realizzate" : "Heures planifiées et réalisées",
    sousTitre: it
      ? `Presenze · Centri REX e MIARAKA · Generato da ${ctx.generatedBy} il ${fmtDate(ctx.generatedAt, ctx.lang)}`
      : `Pointage · Centres REX et MIARAKA · Édité par ${ctx.generatedBy} le ${fmtDate(ctx.generatedAt, ctx.lang)}`,
    planifie: it ? "Pianificato" : "Planifié",
    realise: it ? "Realizzato" : "Réalisé",
    ecart: it ? "Scarto" : "Écart",
    agents: it ? "Agenti" : "Agents",
    collecte: it ? "Raccolta timbrature" : "Collecte des pointages",
    detail: it ? "Dettaglio per agente" : "Détail par agent",
    parSite: it ? "Sintesi per sede" : "Synthèse par centre",
    agent: it ? "Agente" : "Agent",
    site: it ? "Sede" : "Centre",
    jours: it ? "Giorni" : "Jours",
    sansPointage: it ? "Senza timbr." : "Sans pointage",
    anomalies: it ? "Anomalie" : "Anomalies",
  };

  const couleurEcart = (m: number) =>
    m < -60 ? COLORS.critical : m > 60 ? COLORS.warning : COLORS.textMuted;

  return (
    <Document title={l.titre} author="La Vita Per Te">
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader ctx={ctx} reportNumber="PLN" />
        <ReportFooter lang={ctx.lang} />
        <TitleBlock title={l.titre} subtitle={l.sousTitre} />

        <View style={styles.contextBox}>
          <View style={styles.contextItem}>
            <Text style={styles.contextLabel}>{it ? "Periodo" : "Période"}</Text>
            <Text style={styles.contextValue}>
              {data.moisLabel} ({data.du} → {data.au})
            </Text>
          </View>
        </View>

        <KpiGrid
          kpis={[
            { label: l.planifie, value: versHeures(data.totalPlanifie), hint: `${data.nbAgentsPlanifies} ${l.agents.toLowerCase()}` },
            { label: l.realise, value: versHeures(data.totalRealise), hint: `${data.nbAgents} ${l.agents.toLowerCase()}` },
            { label: l.ecart, value: fmtEcart(data.totalEcart) },
            { label: l.collecte, value: `${data.tauxCollecte.toFixed(0)} %`, hint: `${data.totalJoursSansPointage} ${it ? "giorni senza dato" : "jours sans donnée"}` },
          ]}
        />

        {/* Avertissement méthodologique : sans lui, un écart négatif se lit
            comme une faute de l'agent alors qu'il traduit souvent un défaut
            de collecte. */}
        {data.tauxCollecte < 95 && (
          <View style={[styles.contextBox, { borderColor: COLORS.warning, marginTop: 8 }]}>
            <Text style={[styles.contextValue, { color: COLORS.warning }]}>
              {it
                ? `Attenzione: ${data.totalJoursSansPointage} giorni pianificati non hanno alcuna timbratura. Gli scarti negativi riflettono probabilmente dati mancanti, non assenze.`
                : `Attention : ${data.totalJoursSansPointage} journées planifiées ne comportent aucun pointage. Les écarts négatifs traduisent vraisemblablement des données manquantes, non des absences.`}
            </Text>
          </View>
        )}

        <SectionHeader title={l.parSite} meta={`${data.parSite.length} ${it ? "sedi" : "centres"}`} />
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
            <Td w="16%" right mono couleur={couleurEcart(s.realise - s.planifie)}>
              {fmtEcart(s.realise - s.planifie)}
            </Td>
          </View>
        ))}

        <View style={{ height: 12 }} />
        <SectionHeader title={l.detail} meta={`${data.lignes.length} ${l.agents.toLowerCase()}`} />
        {data.lignes.length === 0 ? (
          <EmptyState message={it ? "Nessun dato nel periodo." : "Aucune donnée sur la période."} />
        ) : (
          <>
            <View style={styles.tableRowHeader}>
              <Th w="26%">{l.agent}</Th>
              <Th w="12%">{l.site}</Th>
              <Th w="9%" right>{l.jours}</Th>
              <Th w="13%" right>{l.planifie}</Th>
              <Th w="13%" right>{l.realise}</Th>
              <Th w="13%" right>{l.ecart}</Th>
              <Th w="14%" right>{l.sansPointage}</Th>
            </View>
            {data.lignes.map((r: LigneEtat, i) => (
              <View key={r.agentId} style={[styles.tableRow, i % 2 ? styles.tableRowAlt : {}]} wrap={false}>
                <Td w="26%">
                  {r.nom}
                  {r.statut === "prestataire" ? " *" : ""}
                </Td>
                <Td w="12%">{r.site}</Td>
                <Td w="9%" right mono>{`${r.joursTravailles}/${r.joursPlanifies}`}</Td>
                <Td w="13%" right mono>{versHeures(r.minutesPlanifiees)}</Td>
                <Td w="13%" right mono>{versHeures(r.minutesRealisees)}</Td>
                <Td w="13%" right mono couleur={couleurEcart(r.ecartMinutes)}>{fmtEcart(r.ecartMinutes)}</Td>
                <Td w="14%" right mono couleur={r.joursSansPointage > 0 ? COLORS.warning : undefined}>
                  {r.joursSansPointage > 0 ? String(r.joursSansPointage) : "—"}
                </Td>
              </View>
            ))}
          </>
        )}

        <View style={{ marginTop: 10 }}>
          <Text style={[styles.td, { color: COLORS.textMuted, fontSize: 7 }]}>
            {it
              ? "* Collaboratore: ora di ingresso limitata a 7:50 / 13:50. La colonna Giorni indica i giorni lavorati sul totale pianificato. Uno scarto negativo con giorni senza timbratura segnala dati mancanti."
              : "* Prestataire : heure d'entrée plafonnée à 7:50 / 13:50. La colonne Jours indique les journées travaillées sur le total planifié. Un écart négatif accompagné de journées sans pointage signale des données manquantes, non une absence."}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export function renderEtatPlanifieRealise(data: EtatPlanifieRealise, ctx: ReportContext) {
  return renderToStream(<EtatDoc data={data} ctx={ctx} />);
}
