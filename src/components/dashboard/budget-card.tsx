import { GlassCard } from "@/components/glass/glass-card";
import { Euro, TrendingUp } from "lucide-react";
import type { BudgetEstimate } from "@/lib/dashboard-stats";

interface Props {
  budget: BudgetEstimate;
}

function fmtAriary(n: number): string {
  // Séparateur milliers + suffixe "Ar" (MGA n'a pas de subdivision usuelle)
  return (
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
      .format(n)
      .replace(/\u202f/g, " ") + " Ar"
  );
}

export function BudgetCard({ budget }: Props) {
  const top3 = budget.byType.slice(0, 3);

  return (
    <GlassCard className="p-6" glow={budget.totalCritical > 0 ? "brand" : "none"}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Renouvellement
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold">
            Budget estimé
          </h3>
        </div>
        <div className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Euro className="size-5" />
        </div>
      </div>

      <div className="mt-6">
        <p className="font-display text-4xl font-semibold tabular-nums text-primary">
          {fmtAriary(budget.totalEstimated)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {budget.totalCritical > 0 ? (
            <>
              pour remplacer les{" "}
              <span className="text-foreground font-medium tabular-nums">
                {budget.totalCritical}
              </span>{" "}
              matériels critiques ·{" "}
              <span className="tabular-nums">{fmtAriary(budget.avgPerItem)}</span>{" "}
              par unité (moy.)
            </>
          ) : (
            "Aucun matériel à remplacer en priorité"
          )}
        </p>
      </div>

      {top3.length > 0 && (
        <div className="mt-5 pt-4 border-t border-glass-border space-y-2.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="size-3" />
            Postes principaux
          </p>
          {top3.map((item) => {
            const pct =
              budget.totalEstimated > 0
                ? Math.round((item.cost / budget.totalEstimated) * 100)
                : 0;
            return (
              <div
                key={item.type}
                className="flex items-center gap-3 text-sm"
              >
                <span className="flex-1 truncate">{item.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums font-mono">
                  ×{item.count}
                </span>
                <span className="tabular-nums font-medium">
                  {fmtAriary(item.cost)}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-[10px] text-muted-foreground/70 leading-relaxed">
        Estimation indicative basée sur les prix d&apos;achat connus et les prix
        moyens par type. Les coûts réels peuvent varier selon fournisseur et
        livraison.
      </p>
    </GlassCard>
  );
}
