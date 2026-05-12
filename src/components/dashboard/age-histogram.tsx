import { GlassCard } from "@/components/glass/glass-card";
import type { AgeBucket } from "@/lib/dashboard-stats";
import { getT, type Lang } from "@/lib/i18n";

interface Props {
  buckets: AgeBucket[];
  lang?: Lang;
}

export function AgeHistogram({ buckets, lang = "fr" }: Props) {
  const t = getT(lang);

  if (buckets.length === 0) {
    return (
      <GlassCard className="p-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("dashboard.age_section")}
        </p>
        <h3 className="mt-1 font-display text-lg font-semibold">
          {t("dashboard.age_title")}
        </h3>
        <p className="mt-6 text-sm text-muted-foreground">
          {t("dashboard.age_empty")}
        </p>
      </GlassCard>
    );
  }

  const max = Math.max(...buckets.map((b) => b.count), 1);
  const currentYear = new Date().getFullYear();

  return (
    <GlassCard className="p-6">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {t("dashboard.age_section")}
      </p>
      <h3 className="mt-1 font-display text-lg font-semibold">
        {t("dashboard.age_title")}
      </h3>

      <div className="mt-6 flex items-end gap-1.5 h-40">
        {buckets.map((b) => {
          const h = (b.count / max) * 100;
          const age = currentYear - b.year;
          // Coloration graduée : récent (cyan) → ancien (rouge)
          const color =
            age <= 3
              ? "oklch(0.80 0.15 190)" // cyan
              : age <= 6
                ? "oklch(0.75 0.18 150)" // vert
                : age <= 9
                  ? "oklch(0.82 0.16 85)" // jaune
                  : "oklch(0.64 0.24 27)"; // rouge
          return (
            <div
              key={b.year}
              className="flex-1 flex flex-col items-center gap-1 group min-w-0"
              title={t("dashboard.age_tooltip", { year: b.year, count: b.count, age })}
            >
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                {b.count}
              </span>
              <div
                className="w-full rounded-t-md transition-all group-hover:brightness-125"
                style={{
                  height: `${Math.max(h, b.count > 0 ? 4 : 1)}%`,
                  backgroundColor: b.count > 0 ? color : "oklch(1 0 0 / 0.05)",
                }}
              />
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                {String(b.year).slice(-2)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
        <Legend color="oklch(0.80 0.15 190)" label={t("dashboard.age_0_3")} />
        <Legend color="oklch(0.75 0.18 150)" label={t("dashboard.age_4_6")} />
        <Legend color="oklch(0.82 0.16 85)" label={t("dashboard.age_7_9")} />
        <Legend color="oklch(0.64 0.24 27)" label={t("dashboard.age_10_plus")} />
      </div>
    </GlassCard>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
