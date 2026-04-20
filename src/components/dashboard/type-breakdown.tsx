import { GlassCard } from "@/components/glass/glass-card";
import { MaterialTypeIcon } from "@/components/materials/type-icon";
import Link from "next/link";
import type { TypeStats } from "@/lib/dashboard-stats";

interface Props {
  types: TypeStats[];
  limit?: number;
}

export function TypeBreakdown({ types, limit = 7 }: Props) {
  const displayed = types.slice(0, limit);
  const max = Math.max(...displayed.map((t) => t.total), 1);

  return (
    <GlassCard className="p-6">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Par catégorie
      </p>
      <h3 className="mt-1 font-display text-lg font-semibold">
        Types de matériel
      </h3>

      <ul className="mt-5 space-y-3">
        {displayed.map((t) => {
          const pct = (t.total / max) * 100;
          const criticalRatio = t.total > 0 ? t.critical / t.total : 0;
          return (
            <li key={t.type}>
              <Link
                href={`/materials?type=${t.type}`}
                className="block group"
              >
                <div className="flex items-center gap-3 mb-1">
                  <div className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/12 text-primary shrink-0">
                    <MaterialTypeIcon type={t.type} className="size-3.5" />
                  </div>
                  <span className="text-sm flex-1 truncate group-hover:text-primary transition-colors">
                    {t.label}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums font-mono">
                    {t.total}
                  </span>
                  {t.critical > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/15 text-primary tabular-nums">
                      {t.critical} crit.
                    </span>
                  )}
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
          +{types.length - limit} autres types
        </p>
      )}
    </GlassCard>
  );
}
