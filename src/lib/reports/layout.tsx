import { View, Text } from "@react-pdf/renderer";
import { styles, fmtDateTime } from "./theme";
import type { ReportContext } from "./types";

/* ============================================================
   HEADER — apparaît sur chaque page (fixed via Page wrap)
   ============================================================ */
export function ReportHeader({ ctx, reportNumber }: { ctx: ReportContext; reportNumber?: string }) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.headerLeft}>
        <Text style={styles.headerBrand}>La Vita Per Te</Text>
        <Text style={styles.headerSubtitle}>ONG-ODV Alfeo Corassori · Fianarantsoa</Text>
      </View>
      <View style={styles.headerRight}>
        {reportNumber && <Text style={styles.headerReportNum}>Rapport n° {reportNumber}</Text>}
        <Text style={styles.headerDate}>{fmtDateTime(ctx.generatedAt, ctx.lang)}</Text>
      </View>
    </View>
  );
}

/* ============================================================
   FOOTER — numéro de page + mention confidentialité
   ============================================================ */
export function ReportFooter({ lang = "fr" }: { lang?: "fr" | "it" }) {
  const confidential =
    lang === "it"
      ? "Documento confidenziale · Uso interno · La Vita Per Te"
      : "Document confidentiel · Usage interne · La Vita Per Te";
  const pageLabel = lang === "it" ? "Pagina" : "Page";
  const ofLabel = lang === "it" ? "di" : "sur";
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerLeft}>lavitaperteonlus.vercel.app</Text>
      <Text style={styles.footerCenter}>{confidential}</Text>
      <Text
        style={styles.footerRight}
        render={({ pageNumber, totalPages }) =>
          `${pageLabel} ${pageNumber} ${ofLabel} ${totalPages}`
        }
      />
    </View>
  );
}

/* ============================================================
   TITLE BLOCK — titre + sous-titre (1 seule fois par doc)
   ============================================================ */
export function TitleBlock({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

/* ============================================================
   CONTEXT BOX — résumé des filtres appliqués
   ============================================================ */
export function ContextBox({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.contextBox}>
      {items.map((item, i) => (
        <View key={i} style={styles.contextItem}>
          <Text style={styles.contextLabel}>{item.label}</Text>
          <Text style={styles.contextValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

/* ============================================================
   KPI GRID — cartes synthétiques en haut de rapport
   ============================================================ */
export function KpiGrid({
  kpis,
}: {
  kpis: { label: string; value: string; hint?: string }[];
}) {
  return (
    <View style={styles.kpiGrid}>
      {kpis.map((k, i) => (
        <View key={i} style={styles.kpi}>
          <Text style={styles.kpiLabel}>{k.label}</Text>
          <Text style={styles.kpiValue}>{k.value}</Text>
          {k.hint && <Text style={styles.kpiHint}>{k.hint}</Text>}
        </View>
      ))}
    </View>
  );
}

/* ============================================================
   SECTION HEADER — groupe (ex: "Centre REX — Salle 03")
   ============================================================ */
export function SectionHeader({
  title,
  meta,
}: {
  title: string;
  meta?: string;
}) {
  return (
    <View wrap={false}>
      <Text style={styles.sectionHeader}>{title}</Text>
      {meta && <Text style={styles.sectionMeta}>{meta}</Text>}
    </View>
  );
}

/* ============================================================
   EMPTY STATE
   ============================================================ */
export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

/* ============================================================
   SCORE BADGE (selon niveau obsolescence)
   ============================================================ */
export function ScoreBadge({ score }: { score: number }) {
  const style =
    score >= 70
      ? styles.badgeOk
      : score >= 40
        ? styles.badgeWarning
        : styles.badgeCritical;
  return <Text style={[styles.badge, style]}>{score}</Text>;
}

export function StateBadge({ state, lang = "fr" }: { state: string; lang?: "fr" | "it" }) {
  const labels: Record<string, { fr: string; it: string }> = {
    operationnel: { fr: "OK", it: "OK" },
    en_panne: { fr: "PANNE", it: "GUASTO" },
    en_reparation: { fr: "RÉPAR.", it: "RIPAR." },
    obsolete: { fr: "OBSOLÈTE", it: "OBSOLETO" },
    hors_service: { fr: "HS", it: "FS" },
  };
  const label = labels[state]?.[lang] ?? state;
  const style =
    state === "operationnel"
      ? styles.badgeOk
      : state === "en_panne" || state === "hors_service"
        ? styles.badgeCritical
        : styles.badgeWarning;
  return <Text style={[styles.badge, style]}>{label}</Text>;
}
