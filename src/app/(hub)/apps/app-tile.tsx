import Link from "next/link";
import {
  Cpu,
  Pill,
  HeartPulse,
  Globe,
  ArrowUpRight,
  Clock,
  type LucideIcon,
} from "lucide-react";

import { GlassCard } from "@/components/glass/glass-card";
import { cn } from "@/lib/utils";

export interface HubApp {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: "cpu" | "pill" | "heart-pulse" | "globe";
  tone: "primary" | "success" | "cyan" | "warning";
  visible: boolean;
  status: "live" | "soon" | "external";
}

const ICONS: Record<HubApp["icon"], LucideIcon> = {
  cpu: Cpu,
  pill: Pill,
  "heart-pulse": HeartPulse,
  globe: Globe,
};

const TONES: Record<HubApp["tone"], { bg: string; text: string; glow: string }> = {
  primary: {
    bg: "bg-primary/15",
    text: "text-primary",
    glow: "oklch(0.65 0.20 25 / 0.30)",
  },
  success: {
    bg: "bg-[oklch(0.75_0.18_150_/_0.15)]",
    text: "text-[oklch(0.75_0.18_150)]",
    glow: "oklch(0.75 0.18 150 / 0.30)",
  },
  cyan: {
    bg: "bg-accent/15",
    text: "text-accent",
    glow: "oklch(0.80 0.16 190 / 0.30)",
  },
  warning: {
    bg: "bg-[oklch(0.82_0.16_85_/_0.15)]",
    text: "text-[oklch(0.82_0.16_85)]",
    glow: "oklch(0.82 0.16 85 / 0.30)",
  },
};

/**
 * Tuile d'application façon springboard iOS : grande icône glass au
 * centre, nom en dessous, badge d'état. Toute la tuile est cliquable.
 */
export function AppTile({
  app,
  openLabel,
  soonLabel,
  externalLabel,
}: {
  app: HubApp;
  openLabel: string;
  soonLabel: string;
  externalLabel: string;
}) {
  const Icon = ICONS[app.icon];
  const tone = TONES[app.tone];
  const disabled = app.status === "soon";
  const isExternal = app.status === "external";

  const inner = (
    <GlassCard
      interactive={!disabled}
      className={cn(
        "group relative flex h-full flex-col items-center p-6 text-center transition-opacity",
        disabled && "opacity-60",
      )}
    >
      {/* Badge état — haut droite */}
      {app.status !== "live" && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full glass border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
          {isExternal ? (
            <ArrowUpRight className="size-2.5" aria-hidden="true" />
          ) : (
            <Clock className="size-2.5" aria-hidden="true" />
          )}
          {isExternal ? externalLabel : soonLabel}
        </span>
      )}

      {/* Icône app — style iOS, gros carré arrondi avec glow */}
      <div
        className={cn(
          "mt-4 inline-flex size-20 items-center justify-center rounded-[22px] border border-glass-border shadow-lg transition-transform duration-300",
          tone.bg,
          tone.text,
          !disabled && "group-hover:scale-105",
        )}
        style={{ boxShadow: `0 8px 32px ${tone.glow}` }}
      >
        <Icon className="size-9" aria-hidden="true" />
      </div>

      <h2 className="mt-5 font-display text-base font-semibold leading-tight">
        {app.title}
      </h2>
      <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">
        {app.description}
      </p>

      {!disabled && (
        <span
          className={cn(
            "mt-4 inline-flex items-center gap-1 text-xs font-medium",
            tone.text,
          )}
        >
          {openLabel}
          <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
        </span>
      )}
    </GlassCard>
  );

  if (disabled) {
    return (
      <div aria-disabled="true" className="h-full cursor-not-allowed">
        {inner}
      </div>
    );
  }

  if (isExternal) {
    return (
      <a
        href={app.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${app.title} (${externalLabel})`}
        className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-3xl"
      >
        {inner}
      </a>
    );
  }

  return (
    <Link
      href={app.href}
      aria-label={app.title}
      className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-3xl"
    >
      {inner}
    </Link>
  );
}
