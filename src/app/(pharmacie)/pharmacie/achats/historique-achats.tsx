"use client";

import * as React from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { getT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Achat } from "@/lib/pharmacie/types";

import { detailAchatAction } from "./actions";

/* ============================================================
   REGISTRE DES ENTRÉES — l'en-tête, puis le contenu à la demande
   ============================================================

   Une facture fournisseur ne se vérifie pas sur son seul total : ce qu'on
   veut savoir en la rouvrant, c'est ce qu'elle contenait — quels produits,
   en quelle quantité, sous quel numéro de lot et à quelle péremption. Ces
   deux dernières colonnes sont le cœur de la traçabilité sanitaire : en
   cas de rappel de lot, c'est ici qu'on retrouve d'où il vient.

   Les lignes sont chargées au moment où l'on ouvre une entrée, puis
   mémorisées : les transmettre toutes d'emblée alourdirait la page pour
   des détails qu'on ne consulte qu'à l'occasion.
   ============================================================ */

interface LigneAchat {
  designation: string;
  contenance: string;
  quantite: number;
  numeroLot: string;
  dateExpiration: string;
  montant: number;
}

function ariary(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);
}

export function HistoriqueAchats({ achats, lang }: { achats: Achat[]; lang: Lang }) {
  const t = React.useMemo(() => getT(lang), [lang]);
  const [ouvert, setOuvert] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState<Record<string, LigneAchat[]>>({});
  const [chargeId, setChargeId] = React.useState<string | null>(null);

  async function basculer(achatId: string) {
    if (ouvert === achatId) {
      setOuvert(null);
      return;
    }
    setOuvert(achatId);
    if (details[achatId]) return; // déjà connu
    setChargeId(achatId);
    try {
      const r = await detailAchatAction(achatId);
      if (r.ok) setDetails((d) => ({ ...d, [achatId]: r.lignes }));
      else {
        toast.error(t("common.failed"), { description: r.error });
        setOuvert(null);
      }
    } finally {
      setChargeId(null);
    }
  }

  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("pharmacie.achats_historique")}</caption>
          <thead>
            <tr className="border-b border-glass-border text-left">
              <Th>{t("pharmacie.achats_date_facture")}</Th>
              <Th>{t("pharmacie.achats_origine")}</Th>
              <Th>{t("pharmacie.achats_num_facture")}</Th>
              <Th className="text-right">{t("pharmacie.achats_total")}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-glass-border">
            {achats.map((a) => {
              const estOuvert = ouvert === a.id;
              return (
                <React.Fragment key={a.id}>
                  <tr
                    onClick={() => basculer(a.id)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-foreground/5",
                      estOuvert && "bg-accent/8",
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      <ChevronRight
                        className={cn(
                          "mr-1.5 inline size-3 transition-transform",
                          estOuvert && "rotate-90",
                        )}
                        aria-hidden="true"
                      />
                      {a.date_facture || a.timestamp.slice(0, 10) || "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">{a.fournisseur || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {a.num_facture || a.num_bl || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {ariary(a.montant_total)} Ar
                    </td>
                  </tr>

                  {estOuvert && (
                    <tr className="bg-accent/5">
                      <td colSpan={4} className="px-4 pb-4 pt-1">
                        {chargeId === a.id ? (
                          <p className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                            {t("common.loading")}
                          </p>
                        ) : (
                          <Detail lignes={details[a.id] ?? []} note={a.note} t={t} />
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

function Detail({
  lignes,
  note,
  t,
}: {
  lignes: LigneAchat[];
  note: string;
  t: ReturnType<typeof getT>;
}) {
  if (lignes.length === 0) {
    return (
      <p className="py-2 text-xs text-muted-foreground">{t("pharmacie.achat_aucune_ligne")}</p>
    );
  }
  return (
    <div className="rounded-xl border border-glass-border bg-background/40 p-3">
      {note ? (
        <p className="mb-2 text-xs">
          <span className="text-muted-foreground">{t("pharmacie.achats_note")} </span>
          {note}
        </p>
      ) : null}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-glass-border text-left text-muted-foreground">
            <th scope="col" className="py-1.5 font-medium">{t("pharmacie.col_designation")}</th>
            <th scope="col" className="py-1.5 text-right font-medium">{t("pharmacie.detail_qte")}</th>
            <th scope="col" className="py-1.5 font-medium">{t("pharmacie.achat_lot")}</th>
            <th scope="col" className="py-1.5 font-medium">{t("pharmacie.col_peremption")}</th>
            <th scope="col" className="py-1.5 text-right font-medium">{t("pharmacie.vente_total")}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i} className="border-b border-glass-border/50 last:border-0">
              <td className="py-1.5 pr-2">
                <span className="font-medium">{l.designation}</span>
                {l.contenance ? (
                  <span className="text-muted-foreground"> · {l.contenance}</span>
                ) : null}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums">{l.quantite}</td>
              <td className="py-1.5 font-mono text-[11px]">
                {l.numeroLot || <span className="text-muted-foreground">—</span>}
              </td>
              <td className="py-1.5 font-mono text-[11px]">
                {l.dateExpiration || <span className="text-muted-foreground">—</span>}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums font-medium">
                {ariary(l.montant)} Ar
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}
