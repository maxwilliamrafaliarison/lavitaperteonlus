"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { getT, type Lang } from "@/lib/i18n";

import { definirParametresAction } from "./actions";

export function ParametresForm({
  tvaActiveInitial,
  tvaTauxInitial,
  lang,
}: {
  tvaActiveInitial: boolean;
  tvaTauxInitial: number;
  lang: Lang;
}) {
  const router = useRouter();
  const t = React.useMemo(() => getT(lang), [lang]);
  const [tvaActive, setTvaActive] = React.useState(tvaActiveInitial);
  const [tvaTaux, setTvaTaux] = React.useState(tvaTauxInitial);
  const [loading, setLoading] = React.useState(false);

  async function enregistrer() {
    setLoading(true);
    try {
      const r = await definirParametresAction({ tvaActive, tvaTaux });
      if (r.ok) {
        toast.success(t("pharmacie.param_success"));
        router.refresh();
      } else {
        toast.error(t("common.failed"), { description: r.error });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassCard className="max-w-2xl p-6 space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold">
          {t("pharmacie.param_tva_titre")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("pharmacie.param_tva_aide")}
        </p>
      </div>

      {/* Interrupteur TVA */}
      <label className="flex items-center justify-between gap-4 rounded-xl glass border px-4 py-3">
        <span className="text-sm font-medium">{t("pharmacie.param_tva_active")}</span>
        <button
          type="button"
          role="switch"
          aria-checked={tvaActive}
          onClick={() => setTvaActive((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
            tvaActive ? "bg-primary" : "bg-white/15"
          }`}
        >
          <span
            className={`inline-block size-5 transform rounded-full bg-white transition-transform ${
              tvaActive ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </label>

      {/* Taux, actif seulement si la TVA l'est */}
      <label className={`block transition-opacity ${tvaActive ? "" : "opacity-40"}`}>
        <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
          {t("pharmacie.param_tva_taux")}
        </span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            disabled={!tvaActive}
            value={tvaTaux}
            onChange={(e) =>
              setTvaTaux(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
            }
            className="w-32 rounded-xl glass border px-3.5 h-11 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </label>

      <GlassButton
        type="button"
        variant="brand"
        size="md"
        onClick={enregistrer}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Save className="size-4" aria-hidden="true" />
        )}
        {t("pharmacie.param_enregistrer")}
      </GlassButton>
    </GlassCard>
  );
}
