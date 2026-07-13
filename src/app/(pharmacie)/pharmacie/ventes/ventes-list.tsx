"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Receipt, FileText, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { getT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { VenteResume } from "@/lib/pharmacie/sheets";

import { annulerVenteAction } from "./actions";

function fmtAr(n: number): string {
  return (
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) +
    " Ar"
  );
}

function fmtDateTime(iso: string, lang: Lang): string {
  try {
    return new Date(iso).toLocaleString(lang === "it" ? "it-IT" : "fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function VentesList({
  ventes,
  lang,
  peutAnnuler,
}: {
  ventes: VenteResume[];
  lang: Lang;
  peutAnnuler: boolean;
}) {
  const router = useRouter();
  const t = React.useMemo(() => getT(lang), [lang]);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [loadingId, setLoadingId] = React.useState<string | null>(null);

  // Le clic ailleurs annule la confirmation en attente
  React.useEffect(() => {
    if (!confirmId) return;
    const timer = setTimeout(() => setConfirmId(null), 4000);
    return () => clearTimeout(timer);
  }, [confirmId]);

  async function annuler(vente: VenteResume) {
    setLoadingId(vente.id);
    try {
      const result = await annulerVenteAction(vente.id);
      if (result.ok) {
        toast.success(t("pharmacie.annul_success"), {
          description: vente.id,
        });
        router.refresh();
      } else {
        toast.error(t("common.failed"), { description: result.error });
      }
    } finally {
      setLoadingId(null);
      setConfirmId(null);
    }
  }

  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("pharmacie.ventes_title")}</caption>
          <thead>
            <tr className="border-b border-glass-border text-left">
              <Th>{t("pharmacie.ventes_col_num")}</Th>
              <Th>{t("pharmacie.ventes_col_date")}</Th>
              <Th className="hidden md:table-cell">{t("pharmacie.vente_client")}</Th>
              <Th className="text-right">{t("pharmacie.ventes_col_articles")}</Th>
              <Th className="text-right">{t("pharmacie.vente_total")}</Th>
              <Th className="hidden lg:table-cell">{t("pharmacie.ventes_col_caissier")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-glass-border">
            {ventes.map((v) => {
              const annulee = v.statut === "annulee";
              const busy = loadingId === v.id;
              return (
                <tr
                  key={v.id}
                  className={cn(
                    "hover:bg-white/3 transition-colors",
                    annulee && "opacity-55",
                  )}
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    {v.id}
                    {annulee && (
                      <span className="ml-2 inline-block rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                        {t("pharmacie.annul_badge")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                    {fmtDateTime(v.timestamp, lang)}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {v.clientNom || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {v.nbArticles}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-medium">
                    {fmtAr(v.total)}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                    {v.operateurEmail.split("@")[0]}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <IconBtn
                        label={t("pharmacie.vente_ticket")}
                        onClick={() =>
                          window.open(
                            `/api/pharmacie/ventes/${v.id}/ticket`,
                            "_blank",
                            "noopener",
                          )
                        }
                      >
                        <Receipt className="size-3.5" aria-hidden="true" />
                      </IconBtn>
                      <IconBtn
                        label={t("pharmacie.vente_facture")}
                        onClick={() =>
                          window.open(
                            `/api/pharmacie/ventes/${v.id}/facture`,
                            "_blank",
                            "noopener",
                          )
                        }
                      >
                        <FileText className="size-3.5" aria-hidden="true" />
                      </IconBtn>
                      {peutAnnuler && !annulee && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            confirmId === v.id ? annuler(v) : setConfirmId(v.id)
                          }
                          className={cn(
                            "inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-all",
                            confirmId === v.id
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-glass-border glass text-muted-foreground hover:text-primary hover:border-primary/40",
                          )}
                        >
                          {busy ? (
                            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <Ban className="size-3" aria-hidden="true" />
                          )}
                          {confirmId === v.id
                            ? t("pharmacie.annul_confirm")
                            : t("pharmacie.annul_cta")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-3 text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium",
        className,
      )}
    >
      {children}
    </th>
  );
}

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex size-7 items-center justify-center rounded-lg glass border border-glass-border text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {children}
    </button>
  );
}
