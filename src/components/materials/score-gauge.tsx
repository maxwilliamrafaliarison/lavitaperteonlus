import type { ObsolescenceLevel } from "@/lib/obsolescence";
import { cn } from "@/lib/utils";

interface ScoreGaugeProps {
  score: number;
  level: ObsolescenceLevel;
  size?: number;
  className?: string;
}

const LEVEL_COLORS: Record<ObsolescenceLevel, string> = {
  ok: "stroke-[oklch(0.75_0.18_150)]",
  warning: "stroke-[oklch(0.82_0.16_85)]",
  critical: "stroke-primary",
};

const LEVEL_TEXT: Record<ObsolescenceLevel, string> = {
  ok: "text-[oklch(0.75_0.18_150)]",
  warning: "text-[oklch(0.82_0.16_85)]",
  critical: "text-primary",
};

export function ScoreGauge({ score, level, size = 120, className }: ScoreGaugeProps) {
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={8}
          fill="none"
          className="stroke-white/8"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(LEVEL_COLORS[level], "transition-all duration-700")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-display text-3xl font-semibold tabular-nums", LEVEL_TEXT[level])}>
          {Math.round(score)}
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground -mt-0.5">
          /100
        </span>
      </div>
    </div>
  );
}
