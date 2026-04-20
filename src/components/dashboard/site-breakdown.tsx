import { GlassCard } from "@/components/glass/glass-card";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { LEVEL_CHART_COLOR, type SiteStats } from "@/lib/dashboard-stats";

interface Props {
  sites: SiteStats[];
}

export function SiteBreakdown({ sites }: Props) {
  if (sites.length === 0) {
    return (
      <GlassCard className="p-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Par site
        </p>
        <p className="mt-4 text-sm text-muted-foreground">Aucun site.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Répartition par site
      </p>
      <h3 className="mt-1 font-display text-lg font-semibold">Centres</h3>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {sites.map((site) => {
          const hasItems = site.total > 0;
          const okPct = hasItems ? (site.ok / site.total) * 100 : 0;
          const warningPct = hasItems ? (site.warning / site.total) * 100 : 0;
          const criticalPct = hasItems ? (site.critical / site.total) * 100 : 0;
          const scoreColor =
            site.avgScore >= 70
              ? "text-[oklch(0.75_0.18_150)]"
              : site.avgScore >= 40
                ? "text-[oklch(0.82_0.16_85)]"
                : "text-primary";

          return (
            <Link
              key={site.siteId}
              href={`/sites/${site.siteId}`}
              className="block rounded-2xl border border-glass-border bg-white/3 p-4 hover:bg-white/6 transition-colors group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="inline-flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent shrink-0">
                    <Building2 className="size-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{site.siteName}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {site.siteCode}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-display text-xl font-semibold tabular-nums ${scoreColor}`}>
                    {site.avgScore}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    /100
                  </p>
                </div>
              </div>

              {/* Stacked bar */}
              <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-white/5">
                {okPct > 0 && (
                  <div
                    style={{
                      width: `${okPct}%`,
                      backgroundColor: LEVEL_CHART_COLOR.ok,
                    }}
                  />
                )}
                {warningPct > 0 && (
                  <div
                    style={{
                      width: `${warningPct}%`,
                      backgroundColor: LEVEL_CHART_COLOR.warning,
                    }}
                  />
                )}
                {criticalPct > 0 && (
                  <div
                    style={{
                      width: `${criticalPct}%`,
                      backgroundColor: LEVEL_CHART_COLOR.critical,
                    }}
                  />
                )}
              </div>

              <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="tabular-nums font-mono">{site.total} matériels</span>
                <span>·</span>
                <span className="tabular-nums">
                  <span style={{ color: LEVEL_CHART_COLOR.critical }}>
                    {site.critical}
                  </span>{" "}
                  critiques
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </GlassCard>
  );
}
