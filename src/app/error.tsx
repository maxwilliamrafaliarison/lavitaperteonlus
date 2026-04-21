"use client";

import * as React from "react";
import { AlertOctagon, RefreshCcw, Home } from "lucide-react";
import Link from "next/link";
import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";

/**
 * Global error boundary (app/error.tsx).
 * Capturé automatiquement par Next.js quand un composant React crash côté client.
 * Affiche un écran propre au lieu du fallback brut du framework.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Trace côté client — Vercel capture console.error dans les logs
    console.error("[error-boundary]", {
      name: error.name,
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <GlassCard intensity="strong" glow="brand" className="p-8 md:p-10 max-w-md w-full">
        <div className="text-center">
          <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <AlertOctagon className="size-6" />
          </div>
          <h1 className="mt-6 font-display text-2xl font-semibold">
            Une erreur est survenue
          </h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {error.message || "Quelque chose s'est mal passé."}{" "}
            L&apos;incident a été enregistré dans les logs.
          </p>
          {error.digest && (
            <p className="mt-3 text-[11px] font-mono text-muted-foreground/70">
              Code : {error.digest}
            </p>
          )}
        </div>

        <div className="mt-7 flex flex-col gap-2">
          <GlassButton
            type="button"
            variant="brand"
            size="md"
            onClick={reset}
            className="w-full"
          >
            <RefreshCcw className="size-4" />
            Réessayer
          </GlassButton>
          <Link href="/dashboard" className="w-full">
            <GlassButton variant="glass" size="md" className="w-full">
              <Home className="size-4" />
              Retour au tableau de bord
            </GlassButton>
          </Link>
        </div>
      </GlassCard>
    </main>
  );
}
