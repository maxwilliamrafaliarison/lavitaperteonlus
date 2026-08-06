"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/* ============================================================
   SECTION REPLIABLE — l'accessoire ne doit pas masquer l'essentiel
   ============================================================

   Le tableau de bord sert d'abord à voir le stock. Les listes de suivi —
   à commander, produits à détruire — sont utiles une fois par semaine, pas
   à chaque ouverture, et elles repoussaient le catalogue hors de l'écran.

   Elles restent donc fermées par défaut, mais leur intitulé porte le
   COMPTE : on sait qu'il y a douze produits à commander sans avoir à
   déplier. Ce qui appelle une action se voit ; ce qui la détaille se
   demande.

   `<details>` natif plutôt qu'un état React : le repli fonctionne sans
   JavaScript, le clavier le pilote déjà, et la recherche du navigateur
   (Ctrl+F) ouvre le contenu replié toute seule.
   ============================================================ */

export function SectionRepliable({
  titre,
  compte,
  ton = "neutre",
  icone,
  children,
  defautOuvert = false,
}: {
  titre: string;
  /** Affiché dans l'intitulé : l'information sans le dépli. */
  compte?: number;
  /** Colore la pastille de compte selon l'urgence. */
  ton?: "neutre" | "alerte" | "attention";
  icone?: React.ReactNode;
  children: React.ReactNode;
  defautOuvert?: boolean;
}) {
  const tonPastille =
    ton === "alerte"
      ? "border-primary/30 bg-primary/12 text-primary"
      : ton === "attention"
        ? "border-[var(--warning)]/30 bg-[var(--warning)]/12 text-[var(--warning)]"
        : "border-glass-border bg-foreground/5 text-muted-foreground";

  return (
    <details
      open={defautOuvert}
      className="group rounded-2xl border border-glass-border glass overflow-hidden"
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-sm font-medium",
          "hover:bg-foreground/5 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        )}
      >
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        {icone}
        <span className="flex-1">{titre}</span>
        {compte != null && (
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
              tonPastille,
            )}
          >
            {compte}
          </span>
        )}
      </summary>
      <div className="border-t border-glass-border px-4 py-4">{children}</div>
    </details>
  );
}
