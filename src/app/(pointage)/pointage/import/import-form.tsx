"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { getT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { importerPointagesAction, type ImportResult } from "./actions";

export function ImportForm({ lang }: { lang: Lang }) {
  const router = useRouter();
  const t = React.useMemo(() => getT(lang), [lang]);
  const [installation, setInstallation] = React.useState<"REX" | "MIARAKA">("REX");
  const [fichier, setFichier] = React.useState<File | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [resultat, setResultat] = React.useState<Extract<ImportResult, { ok: true }> | null>(null);

  async function envoyer() {
    if (!fichier) return;
    setLoading(true);
    setResultat(null);
    try {
      const fd = new FormData();
      fd.set("fichier", fichier);
      fd.set("installation", installation);
      const r = await importerPointagesAction(fd);
      if (r.ok) {
        setResultat(r);
        toast.success(t("pointage.import_succes"));
        setFichier(null);
        router.refresh();
      } else {
        toast.error("Échec", { description: r.error });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <GlassCard className="p-6 space-y-5">
        <div>
          <h2 className="font-display text-lg font-semibold">{t("pointage.import_titre")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("pointage.import_aide")}</p>
        </div>

        {/* Installation d'origine : indispensable, le Personnel ID n'a de sens
            que dans la base qui l'a émis (Aina = 15 à REX, 4 à MIARAKA). */}
        <div>
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
            {t("pointage.import_site")}
          </span>
          <div className="flex gap-2">
            {(["REX", "MIARAKA"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setInstallation(s)}
                aria-pressed={installation === s}
                className={cn(
                  "flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  installation === s
                    ? "border-accent/40 bg-accent/12 text-accent"
                    : "border-glass-border text-muted-foreground hover:bg-white/5",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Fichier ZKAccess
          </span>
          <input
            type="file"
            accept=".xls,.xlsx"
            onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-xl file:border file:border-glass-border file:bg-accent/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent hover:file:bg-accent/16"
          />
          {fichier && (
            <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileSpreadsheet className="size-3.5" aria-hidden="true" />
              {fichier.name} · {Math.round(fichier.size / 1024)} Ko
            </span>
          )}
        </label>

        <GlassButton
          type="button"
          variant="brand"
          size="lg"
          className="w-full"
          onClick={envoyer}
          disabled={loading || !fichier}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="size-4" aria-hidden="true" />
          )}
          {t("pointage.import_bouton")}
        </GlassButton>
      </GlassCard>

      {resultat && (
        <GlassCard className="p-6 space-y-3 border-accent/30">
          <div className="flex items-center gap-2 text-accent">
            <CheckCircle2 className="size-5" aria-hidden="true" />
            <h3 className="font-display text-base font-semibold">{t("pointage.import_succes")}</h3>
          </div>
          <ul className="space-y-1 text-sm">
            <li>
              <strong className="font-mono tabular-nums">{resultat.lignesLues}</strong> lignes lues
            </li>
            <li>
              <strong className="font-mono tabular-nums text-accent">{resultat.creees}</strong>{" "}
              pointages ajoutés
            </li>
            <li className="text-muted-foreground">
              <strong className="font-mono tabular-nums">{resultat.ignorees}</strong> ignorés
              (doublons, lignes techniques ou déjà importés)
            </li>
            {resultat.agentsCrees > 0 && (
              <li className="text-muted-foreground">
                <strong className="font-mono tabular-nums">{resultat.agentsCrees}</strong> nouveaux
                agents créés : à compléter dans « Personnel »
              </li>
            )}
          </ul>
          {resultat.anomalies.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/[0.06] p-3 text-xs text-warning">
              {resultat.anomalies.map((a, i) => (
                <p key={i}>{a}</p>
              ))}
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}
