"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageOpen, PackageCheck, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { getT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { StockLot } from "@/lib/pharmacie/types";

import { transfererAction } from "./actions";

export interface ProduitTransfert {
  id: string;
  designation: string;
  uniteDetail: string;
  facteur: number;
  lots: StockLot[];
}

export function TransfertForm({
  produits,
  lang,
}: {
  produits: ProduitTransfert[];
  lang: Lang;
}) {
  const router = useRouter();
  const t = React.useMemo(() => getT(lang), [lang]);
  const [produitId, setProduitId] = React.useState<string>(produits[0]?.id ?? "");
  const [lotId, setLotId] = React.useState<string>(produits[0]?.lots[0]?.lotId ?? "");
  const [sens, setSens] = React.useState<"ouvrir" | "refermer">("ouvrir");
  const [nbBoites, setNbBoites] = React.useState(1);
  const [loading, setLoading] = React.useState(false);

  if (produits.length === 0) {
    return (
      <GlassCard className="p-10 text-center max-w-2xl mx-auto text-muted-foreground text-sm">
        {t("pharmacie.transfert_vide")}
      </GlassCard>
    );
  }

  const produit = produits.find((p) => p.id === produitId) ?? produits[0];
  const lot = produit.lots.find((l) => l.lotId === lotId) ?? produit.lots[0];
  const f = produit.facteur;

  // Maximum de boîtes déplaçables selon le sens (réserve pour ouvrir, rayon
  // pour refermer). Le rayon peut contenir des unités hors boîte entière :
  // on ne referme que des boîtes complètes.
  const maxBoites = Math.floor((sens === "ouvrir" ? lot.gros : lot.detail) / f);

  function choisirProduit(p: ProduitTransfert) {
    setProduitId(p.id);
    setLotId(p.lots[0]?.lotId ?? "");
    setNbBoites(1);
  }

  async function soumettre() {
    if (nbBoites < 1 || nbBoites > maxBoites) return;
    setLoading(true);
    try {
      const r = await transfererAction({ produitId, lotId, sens, nbBoites });
      if (r.ok) {
        toast.success(t("pharmacie.transfert_success"));
        router.refresh();
      } else {
        toast.error(t("common.failed"), { description: r.error });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Colonne 1 : choix du produit */}
      <GlassCard className="p-3 lg:col-span-1">
        <ul role="list" className="space-y-1">
          {produits.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => choisirProduit(p)}
                className={cn(
                  "w-full rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  p.id === produitId ? "bg-primary/12 text-primary" : "hover:bg-white/5",
                )}
              >
                <span className="font-medium">{p.designation}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {p.lots.length} lot{p.lots.length > 1 ? "s" : ""} · {p.facteur} {p.uniteDetail}/bte
                </span>
              </button>
            </li>
          ))}
        </ul>
      </GlassCard>

      {/* Colonne 2-3 : lots + transfert */}
      <div className="lg:col-span-2 space-y-4">
        <GlassCard className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">{produit.designation}</caption>
            <thead>
              <tr className="border-b border-glass-border text-left">
                <Th>{t("pharmacie.transfert_lot")}</Th>
                <Th>{t("pharmacie.transfert_peremption")}</Th>
                <Th className="text-right">{t("pharmacie.transfert_gros")}</Th>
                <Th className="text-right">{t("pharmacie.transfert_detail")}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border">
              {produit.lots.map((l) => {
                const actif = l.lotId === lotId;
                return (
                  <tr
                    key={l.lotId}
                    onClick={() => {
                      setLotId(l.lotId);
                      setNbBoites(1);
                    }}
                    className={cn(
                      "cursor-pointer transition-colors",
                      actif ? "bg-primary/8" : "hover:bg-white/3",
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="lot"
                          checked={actif}
                          onChange={() => setLotId(l.lotId)}
                          className="size-3.5 accent-primary"
                          aria-label={l.numeroLot || l.lotId}
                        />
                        <span className="font-mono text-xs">{l.numeroLot || "—"}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {l.dateExpiration || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {Math.floor(l.gros / f)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {l.detail}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </GlassCard>

        {/* Bloc transfert du lot sélectionné */}
        <GlassCard className="p-5 space-y-4">
          <div className="flex gap-2">
            <SensBtn
              actif={sens === "ouvrir"}
              onClick={() => {
                setSens("ouvrir");
                setNbBoites(1);
              }}
              icon={<PackageOpen className="size-4" aria-hidden="true" />}
              label={t("pharmacie.transfert_ouvrir")}
            />
            <SensBtn
              actif={sens === "refermer"}
              onClick={() => {
                setSens("refermer");
                setNbBoites(1);
              }}
              icon={<PackageCheck className="size-4" aria-hidden="true" />}
              label={t("pharmacie.transfert_refermer")}
            />
          </div>

          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
              {t("pharmacie.transfert_nb_boites")}
            </span>
            <input
              type="number"
              min={1}
              max={maxBoites}
              value={nbBoites}
              onChange={(e) => setNbBoites(Math.max(1, Math.trunc(Number(e.target.value))))}
              aria-describedby="trf-aide"
              className="w-full rounded-xl glass border px-3.5 h-11 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span id="trf-aide" className="mt-1 block text-[11px] text-muted-foreground">
              {sens === "ouvrir"
                ? t("pharmacie.transfert_ouvrir_aide", {
                    n: nbBoites,
                    u: nbBoites * f,
                  })
                : t("pharmacie.transfert_refermer_aide", { n: nbBoites })}
            </span>
          </label>

          <GlassButton
            type="button"
            onClick={soumettre}
            variant="brand"
            size="md"
            className="w-full"
            disabled={loading || maxBoites < 1 || nbBoites < 1 || nbBoites > maxBoites}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowLeftRight className="size-4" aria-hidden="true" />
            )}
            {sens === "ouvrir"
              ? t("pharmacie.transfert_ouvrir")
              : t("pharmacie.transfert_refermer")}
          </GlassButton>
        </GlassCard>
      </div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium",
        className,
      )}
    >
      {children}
    </th>
  );
}

function SensBtn({
  actif,
  onClick,
  icon,
  label,
}: {
  actif: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        actif
          ? "border-primary/40 bg-primary/12 text-primary"
          : "border-glass-border text-muted-foreground hover:bg-white/5",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
