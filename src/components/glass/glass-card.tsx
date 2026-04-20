import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * GlassCard — carte glassmorphism premium (Apple liquid glass).
 * Utilise les tokens CSS --glass / --glass-border (voir globals.css).
 */
export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  intensity?: "subtle" | "normal" | "strong";
  glow?: "none" | "brand" | "cyan";
  interactive?: boolean;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      className,
      intensity = "normal",
      glow = "none",
      interactive = false,
      children,
      ...props
    },
    ref,
  ) => {
    const intensityClass =
      intensity === "subtle"
        ? "glass"
        : intensity === "strong"
          ? "glass-strong"
          : "glass-card";

    const glowClass =
      glow === "brand" ? "brand-glow" : glow === "cyan" ? "cyan-glow" : "";

    return (
      <div
        ref={ref}
        className={cn(
          intensityClass,
          glowClass,
          "rounded-3xl relative",
          interactive &&
            "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl cursor-pointer",
          className,
        )}
        {...props}
      >
        {/* sheen highlight */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-70"
        />
        <div className="relative">{children}</div>
      </div>
    );
  },
);
GlassCard.displayName = "GlassCard";
