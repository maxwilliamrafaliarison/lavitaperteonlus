import Link from "next/link";
import {
  Cpu,
  Pill,
  HeartPulse,
  Globe,
  type LucideIcon,
} from "lucide-react";

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

const TONES: Record<HubApp["tone"], { icon: string; glow: string }> = {
  primary: { icon: "text-primary", glow: "oklch(0.65 0.20 25 / 0.25)" },
  success: {
    icon: "text-[oklch(0.75_0.18_150)]",
    glow: "oklch(0.75 0.18 150 / 0.25)",
  },
  cyan: { icon: "text-accent", glow: "oklch(0.80 0.16 190 / 0.25)" },
  warning: {
    icon: "text-[oklch(0.82_0.16_85)]",
    glow: "oklch(0.82 0.16 85 / 0.25)",
  },
};

/**
 * Tuile springboard iOS : icône squircle glass + nom en dessous.
 * Rien d'autre — même gabarit pour toutes, alignement garanti.
 */
export function AppTile({
  app,
  soonLabel,
}: {
  app: HubApp;
  soonLabel: string;
  openLabel?: string;
  externalLabel?: string;
}) {
  const Icon = ICONS[app.icon];
  const tone = TONES[app.tone];
  const disabled = app.status === "soon";
  const isExternal = app.status === "external";

  const inner = (
    <span className="flex w-24 flex-col items-center gap-3 md:w-28">
      {/* Icône squircle façon iOS */}
      <span
        className={cn(
          "relative inline-flex size-20 items-center justify-center md:size-24",
          "rounded-[24px] md:rounded-[28px] glass-strong border border-glass-border",
          "shadow-xl transition-all duration-300",
          !disabled &&
            "group-hover:scale-105 group-hover:border-white/25 group-active:scale-95",
          disabled && "opacity-45 saturate-50",
          tone.icon,
        )}
        style={disabled ? undefined : { boxShadow: `0 10px 40px ${tone.glow}` }}
      >
        {/* Reflet supérieur, signature liquid glass */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-2 top-1 h-1/3 rounded-full bg-gradient-to-b from-white/25 to-transparent blur-[2px]"
        />
        <Icon className="size-9 md:size-10" aria-hidden="true" strokeWidth={1.6} />
      </span>

      {/* Nom, une ligne, même hauteur pour toutes les tuiles */}
      <span className="flex h-9 flex-col items-center justify-start">
        <span
          className={cn(
            "text-[13px] font-medium leading-tight text-center",
            disabled ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {app.title}
        </span>
        {disabled && (
          <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {soonLabel}
          </span>
        )}
      </span>
    </span>
  );

  if (disabled) {
    return (
      <div
        aria-disabled="true"
        aria-label={`${app.title} (${soonLabel})`}
        className="flex cursor-default justify-center"
      >
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
        aria-label={app.title}
        className="group flex justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {inner}
      </a>
    );
  }

  return (
    <Link
      href={app.href}
      aria-label={app.title}
      className="group flex justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {inner}
    </Link>
  );
}
