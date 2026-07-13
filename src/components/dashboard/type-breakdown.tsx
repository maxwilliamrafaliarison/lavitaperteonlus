import { GlassCard } from "@/components/glass/glass-card";
import { MaterialTypeIcon } from "@/components/materials/type-icon";
import Link from "next/link";
import type { TypeStats } from "@/lib/dashboard-stats";
import { getT, type Lang } from "@/lib/i18n";

interface Props {
  types: TypeStats[];
  limit?: number;
  lang?: Lang;
}

export function TypeBreakdown({ types, limit = 7, lang = "fr" }: Props) {
  const t = getT(lang);
  const displayed = types.slice(0, limit);
  const max = Math.max(...displayed.map((tp) => tp.total), 1);

  return (
    <GlassCard className="p-6">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {t("dashboard.types_section")}
      </p>
      <h3 className="mt-1 font-display text-lg font-semibold">
        {t("dashboard.types_title")}
      </h3>

      <ul className="mt-5 space-y-3">
        {displayed.map((tp) => {
          const pct = (tp.total / max) * 100;
          const criticalRatio = tp.total > 0 ? tp.critical / tp.total : 0;
          return (
            <li key={tp.type}>
              <Link
                href={`/materials?type=${tp.type}`}
                className="block group"
              >
                <div className="flex items-center gap-3 mb-1">
                  <div className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/12 text-primary shrink-0">
                    <MaterialTypeIcon type={tp.type} className="size-3.5" />
                  </div>
                  <span className="text-sm flex-1 truncate group-hover:text-primary transition-colors">
                    {tp.label}
                  </span>
                  {/* Colonnes fixes : total puis badge crit., pour que les
                      chiffres restent alignés verticalement ligne à ligne */}
                  <span className="w-9 text-right text-xs text-muted-foreground tabular-nums font-mono shrink-0">
                    {tp.total}
                  </span>
                  <span className="w-14 text-right shrink-0">
                    {tp.critical > 0 && (
                      <span className="inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/15 text-primary tabular-nums">
                        {tp.critical} {t("dashboard.types_critical_short")}
                      </span>
                    )}
                  </span>
                </div>
                <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/5 ml-10">
                  <div
                    className="h-full bg-gradient-to-r from-accent/60 to-accent"
                    style={{ width: `${pct}%` }}
                  />
                  {criticalRatio > 0 && (
                    <div
                      className="absolute top-0 right-0 h-full bg-primary/60"
                      style={{ width: `${pct * criticalRatio}%` }}
                    />
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {types.length > limit && (
        <p className="mt-4 text-xs text-muted-foreground text-center">
          {t("dashboard.types_others", { n: types.length - limit })}
        </p>
      )}
    </GlassCard>
  );
}
