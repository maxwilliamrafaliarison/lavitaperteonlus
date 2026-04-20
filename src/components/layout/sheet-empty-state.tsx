import Link from "next/link";
import { GlassCard } from "@/components/glass/glass-card";
import { Database, ExternalLink } from "lucide-react";

interface SheetEmptyStateProps {
  title?: string;
  description?: string;
  configError?: boolean;
}

/**
 * Affiché quand le Sheet est vide ou pas encore configuré.
 * Guide l'utilisateur vers la doc Phase 1 (GCP).
 */
export function SheetEmptyState({
  title = "Aucune donnée pour l'instant",
  description = "Le Google Sheet n'a pas encore de données dans cet onglet.",
  configError = false,
}: SheetEmptyStateProps) {
  return (
    <GlassCard className="p-10 text-center max-w-2xl mx-auto">
      <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Database className="size-6" />
      </div>
      <h3 className="mt-6 font-display text-xl font-semibold">
        {configError ? "Connexion au Google Sheet impossible" : title}
      </h3>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
        {configError ? (
          <>
            Les variables d&apos;environnement Google Cloud ne sont pas
            configurées dans Vercel. Suivez le guide{" "}
            <Link
              href="https://github.com/maxwilliamrafaliarison/lavitaperteonlus/blob/main/docs/PHASE1-GCP.md"
              target="_blank"
              className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
            >
              Phase 1 — GCP <ExternalLink className="size-3" />
            </Link>{" "}
            pour activer la connexion.
          </>
        ) : (
          description
        )}
      </p>
    </GlassCard>
  );
}
