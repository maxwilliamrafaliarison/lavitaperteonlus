import { CheckCircle2, AlertTriangle, AlertOctagon } from "lucide-react";
import type { ObsolescenceLevel } from "@/lib/obsolescence";
import { LEVEL_LABELS } from "@/lib/obsolescence";
import { cn } from "@/lib/utils";

interface ObsolescenceBadgeProps {
  level: ObsolescenceLevel;
  score?: number;
  lang?: "fr" | "it";
  showScore?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const LEVEL_STYLES: Record<ObsolescenceLevel, string> = {
  ok: "border-[oklch(0.75_0.18_150_/_0.4)] bg-[oklch(0.75_0.18_150_/_0.12)] text-[oklch(0.75_0.18_150)]",
  warning:
    "border-[oklch(0.82_0.16_85_/_0.4)] bg-[oklch(0.82_0.16_85_/_0.12)] text-[oklch(0.82_0.16_85)]",
  critical: "border-primary/40 bg-primary/12 text-primary",
};

const LEVEL_ICONS: Record<ObsolescenceLevel, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  critical: AlertOctagon,
};

export function ObsolescenceBadge({
  level,
  score,
  lang = "fr",
  showScore = false,
  size = "md",
  className,
}: ObsolescenceBadgeProps) {
  const Icon = LEVEL_ICONS[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 h-6 text-[10px]" : "px-2.5 h-7 text-xs",
        LEVEL_STYLES[level],
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} />
      <span>{LEVEL_LABELS[level][lang]}</span>
      {showScore && typeof score === "number" && (
        <span className="opacity-70 font-mono">· {score}</span>
      )}
    </span>
  );
}
