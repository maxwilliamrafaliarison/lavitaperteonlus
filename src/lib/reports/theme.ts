import { StyleSheet } from "@react-pdf/renderer";

/**
 * Thème PDF partagé — couleurs alignées sur la palette La Vita Per Te
 * (rouge #E30613 logo · cyan #2DD4BF bâtiment), mais ADAPTÉ pour l'impression :
 * - Fond blanc (mode light forcé)
 * - Couleurs moins saturées, contrastes forts pour lisibilité papier
 */
export const COLORS = {
  brand: "#E30613",
  brandSoft: "#FDE8EA",
  cyan: "#2DD4BF",
  cyanSoft: "#E0FAF5",
  text: "#0a0a0b",
  textMuted: "#6b7280",
  textLight: "#9ca3af",
  border: "#e5e7eb",
  borderLight: "#f3f4f6",
  bgHeader: "#f9fafb",
  bgAccent: "#fef3f2",
  // Score levels
  ok: "#059669", // vert
  okSoft: "#d1fae5",
  warning: "#d97706", // orange
  warningSoft: "#fef3c7",
  critical: "#dc2626", // rouge
  criticalSoft: "#fee2e2",
};

/**
 * Format Ariary (pas de subdivision usuelle en MGA).
 */
export function fmtAriary(n: number): string {
  return (
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
      .format(n)
      .replace(/\u202f/g, " ") + " Ar"
  );
}

export function fmtDate(iso: string | undefined, lang: "fr" | "it" = "fr"): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(lang === "it" ? "it-IT" : "fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso: string | undefined, lang: "fr" | "it" = "fr"): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(lang === "it" ? "it-IT" : "fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Styles partagés réutilisables par tous les templates. */
export const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: COLORS.text,
    paddingTop: 72,
    paddingBottom: 60,
    paddingHorizontal: 36,
    backgroundColor: "#ffffff",
  },

  // Header (en-tête de chaque page)
  header: {
    position: "absolute",
    top: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 12,
  },
  headerLeft: { flexDirection: "column" },
  headerBrand: {
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.brand,
    fontFamily: "Helvetica-Bold",
  },
  headerSubtitle: {
    fontSize: 7,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  headerRight: { flexDirection: "column", alignItems: "flex-end" },
  headerReportNum: {
    fontSize: 7,
    color: COLORS.textLight,
    fontFamily: "Helvetica-Oblique",
  },
  headerDate: {
    fontSize: 8,
    color: COLORS.textMuted,
    marginTop: 1,
    fontFamily: "Helvetica",
  },

  // Titre principal
  title: {
    fontSize: 18,
    fontWeight: 700,
    fontFamily: "Helvetica-Bold",
    color: COLORS.text,
    marginBottom: 4,
    marginTop: 0,
  },
  subtitle: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginBottom: 14,
  },

  // Context box (résumé des filtres)
  contextBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 8,
    marginBottom: 14,
    backgroundColor: COLORS.bgHeader,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  contextLabel: {
    fontSize: 7,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: COLORS.textMuted,
  },
  contextValue: {
    fontSize: 9,
    color: COLORS.text,
    fontFamily: "Helvetica-Bold",
  },
  contextItem: { marginRight: 20 },

  // Section heading (titre intermédiaire, ex: "Centre REX — Salle 03")
  sectionHeader: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: COLORS.brand,
    marginTop: 14,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.brand,
  },
  sectionMeta: {
    fontSize: 8,
    color: COLORS.textMuted,
    marginBottom: 6,
  },

  // Tables
  table: { width: "100%", marginBottom: 8 },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
    minHeight: 18,
    alignItems: "center",
    paddingVertical: 3,
  },
  tableRowHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.bgHeader,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    minHeight: 20,
    alignItems: "center",
    paddingVertical: 4,
  },
  tableRowAlt: {
    backgroundColor: COLORS.bgHeader,
  },
  th: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    paddingHorizontal: 4,
  },
  td: {
    fontSize: 8,
    color: COLORS.text,
    paddingHorizontal: 4,
  },
  tdMono: {
    fontSize: 7.5,
    color: COLORS.textMuted,
    fontFamily: "Courier",
    paddingHorizontal: 4,
  },
  tdNum: {
    fontSize: 8,
    color: COLORS.text,
    paddingHorizontal: 4,
    textAlign: "right",
  },

  // Badges (état, score…)
  badge: {
    fontSize: 7,
    paddingVertical: 1.5,
    paddingHorizontal: 5,
    borderRadius: 8,
    alignSelf: "flex-start",
    fontFamily: "Helvetica-Bold",
  },
  badgeOk: { color: COLORS.ok, backgroundColor: COLORS.okSoft },
  badgeWarning: { color: COLORS.warning, backgroundColor: COLORS.warningSoft },
  badgeCritical: { color: COLORS.critical, backgroundColor: COLORS.criticalSoft },
  badgeNeutral: { color: COLORS.textMuted, backgroundColor: COLORS.bgHeader },

  // Summary cards (KPIs en début de rapport)
  kpiGrid: {
    flexDirection: "row",
    marginBottom: 14,
    gap: 8,
  },
  kpi: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 8,
    backgroundColor: COLORS.bgHeader,
  },
  kpiLabel: {
    fontSize: 7,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: COLORS.text,
  },
  kpiHint: {
    fontSize: 7,
    color: COLORS.textMuted,
    marginTop: 1,
  },

  // Empty state
  emptyBox: {
    padding: 30,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
  },
  emptyText: {
    fontSize: 9,
    color: COLORS.textMuted,
    textAlign: "center",
  },

  // Footer (bas de chaque page)
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  footerLeft: {
    fontSize: 7,
    color: COLORS.textLight,
  },
  footerCenter: {
    fontSize: 7,
    color: COLORS.textMuted,
    fontStyle: "italic",
  },
  footerRight: {
    fontSize: 7,
    color: COLORS.textLight,
  },
});
