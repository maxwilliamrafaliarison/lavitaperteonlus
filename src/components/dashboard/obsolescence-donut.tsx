import { GlassCard } from "@/components/glass/glass-card";
import { LEVEL_CHART_COLOR, type LevelDistribution } from "@/lib/dashboard-stats";
import { LEVEL_LABELS } from "@/lib/obsolescence";

interface Props {
  distribution: LevelDistribution;
  lang?: "fr" | "it";
}

export function ObsolescenceDonut({ distribution, lang = "fr" }: Props) {
  const { ok, warning, critical, total } = distribution;
  const size = 220;
  const stroke = 28;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;

  // Ordre : ok → warning → critical (du plus sain au plus rouge)
  const segments = [
    { value: ok, color: LEVEL_CHART_COLOR.ok, label: LEVEL_LABELS.ok[lang] },
    { value: warning, color: LEVEL_CHART_COLOR.warning, label: LEVEL_LABELS.warning[lang] },
    { value: critical, color: LEVEL_CHART_COLOR.critical, label: LEVEL_LABELS.critical[lang] },
  ];

  let offset = 0;

  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Santé du parc
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold">
            Répartition par état
          </h3>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
        <div className="relative shrink-0">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
            aria-label={`${total} matériels : ${ok} opérationnels, ${warning} à surveiller, ${critical} à remplacer`}
          >
            {/* fond */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              className="text-white/5"
            />
            {total > 0 &&
              segments.map((seg) => {
                if (seg.value === 0) return null;
                const fraction = seg.value / total;
                const dash = circ * fraction;
                const circle = (
                  <circle
                    key={seg.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={stroke}
                    strokeDasharray={`${dash} ${circ - dash}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="butt"
                  />
                );
                offset += dash;
                return circle;
              })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-3xl font-semibold tabular-nums">
              {total}
            </span>
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              matériels
            </span>
          </div>
        </div>

        <ul className="flex-1 space-y-3 min-w-[180px]">
          {segments.map((seg) => {
            const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
            return (
              <li key={seg.label} className="flex items-center gap-3">
                <span
                  className="size-3 rounded-sm shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-sm flex-1 truncate">{seg.label}</span>
                <span className="font-mono text-sm tabular-nums">{seg.value}</span>
                <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </GlassCard>
  );
}
