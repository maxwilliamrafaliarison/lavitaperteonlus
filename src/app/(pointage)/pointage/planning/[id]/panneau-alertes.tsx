import { AlertTriangle, CircleCheck, Info } from "lucide-react";

import { GlassCard } from "@/components/glass/glass-card";

import type { AlerteAgent } from "./verif";

/* ============================================================
   PLANNING — ce que la grille signale d'elle-même
   ============================================================

   Le contrôle des seuils existait déjà : il s'exécutait après chaque
   saisie et n'en montrait QUE LA PREMIÈRE, dans une notification qui
   s'efface au bout de huit secondes. Une semaine recopiée depuis la
   précédente pouvait donc être illégale sans qu'aucun message n'apparaisse,
   puisque personne n'avait touché une cellule.

   Le panneau est FIXE, à côté de la grille, et jamais une fenêtre par
   dessus : on lit une alerte pour aller corriger la case qu'elle désigne,
   et une fenêtre modale recouvre précisément les colonnes dont on a besoin
   pour comprendre.

   Une phrase par problème, la personne nommée, le jour daté. Le drapeau
   `bloquant` — calculé depuis le début, jeté jusqu'ici — sépare ce qui
   empêche de publier de ce qui mérite seulement un regard.
   ============================================================ */

const jourLisible = (j: string) =>
  j
    ? new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : "";

export function PanneauAlertes({ alertes }: { alertes: AlerteAgent[] }) {
  const bloquantes = alertes.filter((a) => a.bloquant);
  const vigilance = alertes.filter((a) => !a.bloquant);

  return (
    <GlassCard className="p-0 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-glass-border px-4 py-3">
        {alertes.length === 0 ? (
          <CircleCheck className="size-4 text-[var(--success)]" aria-hidden="true" />
        ) : (
          <AlertTriangle
            className={bloquantes.length ? "size-4 text-[var(--danger)]" : "size-4 text-[var(--warning)]"}
            aria-hidden="true"
          />
        )}
        <h2 className="font-display text-sm font-semibold">
          {alertes.length === 0
            ? "Aucune règle enfreinte"
            : `${alertes.length} point${alertes.length > 1 ? "s" : ""} à regarder`}
        </h2>
        {bloquantes.length > 0 && (
          <span className="ml-auto rounded-full border border-[var(--danger)]/35 bg-[var(--danger)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--danger)]">
            {bloquantes.length} bloquant{bloquantes.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {alertes.length === 0 ? (
        <p className="px-4 py-5 text-xs leading-relaxed text-muted-foreground">
          Repos journalier, repos hebdomadaire et durée hebdomadaire sont respectés sur la période
          affichée. Le contrôle déborde de sept jours de chaque côté : une nuit hors écran compte
          aussi.
        </p>
      ) : (
        <ul className="divide-y divide-glass-border">
          {[...bloquantes, ...vigilance].map((a, i) => (
            <li key={`${a.agentId}-${a.jour}-${a.regle}-${i}`} className="px-4 py-3">
              <p className="flex items-start gap-2 text-xs leading-relaxed">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 font-mono ${a.bloquant ? "text-[var(--danger)]" : "text-[var(--warning)]"}`}
                >
                  {a.bloquant ? "■" : "▲"}
                </span>
                <span>
                  <strong className="font-medium">{a.agentNom || a.agentId}</strong>
                  {a.jour ? <span className="text-muted-foreground"> · {jourLisible(a.jour)}</span> : null}
                  <br />
                  {a.message}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="border-t border-glass-border px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mr-1 inline size-3" aria-hidden="true" />
        L&apos;outil signale, il ne bloque jamais une saisie : la nuit où la seule personne
        disponible enfreint une règle de repos, un planning qui refuse se tient ailleurs, donc
        nulle part.
      </p>
    </GlassCard>
  );
}
