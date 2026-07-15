"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Loader2,
  ShoppingCart,
  CheckCircle2,
  Receipt,
  FileText,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { getT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ProduitAvecStock } from "@/lib/pharmacie/types";

import { creerVenteAction } from "./actions";

interface LignePanier {
  produit: ProduitAvecStock;
  quantite: number;
}

function fmtAr(n: number): string {
  return (
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) +
    " Ar"
  );
}

// 1 Ariary = 5 FMG (francs malgaches) — beaucoup de clients comptent encore en FMG
function fmtFmg(ariary: number): string {
  return (
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(ariary * 5) +
    " FMG"
  );
}

export function VenteForm({
  produits,
  lang,
}: {
  produits: ProduitAvecStock[];
  lang: Lang;
}) {
  const router = useRouter();
  const t = React.useMemo(() => getT(lang), [lang]);
  const [query, setQuery] = React.useState("");
  const [panier, setPanier] = React.useState<LignePanier[]>([]);
  const [clientNom, setClientNom] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState<{ venteId: string; total: number } | null>(null);
  const [recu, setRecu] = React.useState<number>(0);

  const vendables = React.useMemo(
    () => produits.filter((p) => p.statut === "actif" && p.stockBase > 0),
    [produits],
  );

  const resultats = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return vendables
      .filter(
        (p) =>
          p.designation.toLowerCase().includes(q) ||
          p.dci.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, vendables]);

  const total = panier.reduce(
    (s, l) => s + l.quantite * (l.produit.prix_vente || 0),
    0,
  );

  function ajouter(p: ProduitAvecStock) {
    setPanier((prev) => {
      const existing = prev.find((l) => l.produit.id === p.id);
      if (existing) {
        if (existing.quantite >= p.stockBase) {
          toast.warning(t("pharmacie.vente_stock_max", { p: p.designation }));
          return prev;
        }
        return prev.map((l) =>
          l.produit.id === p.id ? { ...l, quantite: l.quantite + 1 } : l,
        );
      }
      return [...prev, { produit: p, quantite: 1 }];
    });
    setQuery("");
  }

  function changerQuantite(id: string, delta: number) {
    setPanier((prev) =>
      prev
        .map((l) => {
          if (l.produit.id !== id) return l;
          const next = Math.min(l.quantite + delta, l.produit.stockBase);
          return { ...l, quantite: next };
        })
        .filter((l) => l.quantite > 0),
    );
  }

  async function encaisser() {
    if (panier.length === 0) return;
    setLoading(true);
    try {
      const result = await creerVenteAction({
        clientNom,
        lignes: panier.map((l) => ({
          produitId: l.produit.id,
          quantite: l.quantite,
          prixUnitaire: l.produit.prix_vente || 0,
        })),
      });
      if (result.ok) {
        setDone({ venteId: result.venteId, total: result.total });
        setRecu(result.total);
        toast.success(t("pharmacie.vente_success"));
        router.refresh();
      } else {
        toast.error(t("common.failed"), { description: result.error });
      }
    } catch (e) {
      toast.error(t("common.failed"), { description: String(e) });
    } finally {
      setLoading(false);
    }
  }

  // -------- Écran de confirmation / ticket --------
  if (done) {
    return (
      <GlassCard className="mx-auto max-w-md p-8 text-center print:shadow-none">
        <CheckCircle2
          className="mx-auto size-12 text-[oklch(0.75_0.18_150)]"
          aria-hidden="true"
        />
        <h2 className="mt-4 font-display text-2xl font-semibold">
          {t("pharmacie.vente_done_title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground font-mono">{done.venteId}</p>

        <div className="mt-6 rounded-2xl glass border p-4 text-left text-sm print:border-black">
          {clientNom && (
            <p className="mb-2 text-muted-foreground">
              {t("pharmacie.vente_client")} : <span className="text-foreground">{clientNom}</span>
            </p>
          )}
          <ul role="list" className="divide-y divide-glass-border">
            {panier.map((l) => (
              <li key={l.produit.id} className="flex justify-between py-1.5">
                <span>
                  {l.produit.designation}{" "}
                  <span className="text-muted-foreground">× {l.quantite}</span>
                </span>
                <span className="font-mono tabular-nums">
                  {fmtAr(l.quantite * (l.produit.prix_vente || 0))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between border-t border-glass-border pt-3 font-semibold">
            <span>{t("pharmacie.vente_total")}</span>
            <span className="font-mono tabular-nums">{fmtAr(done.total)}</span>
          </p>
          <p className="flex justify-end text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">= {fmtFmg(done.total)}</span>
          </p>
        </div>

        {/* Monnaie à rendre (espèces) */}
        <div className="mt-4 rounded-2xl glass border p-4 text-left text-sm print:hidden">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="montant-recu"
              className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              {t("pharmacie.vente_recu")}
            </label>
            <div className="inline-flex items-center gap-1">
              <QtyBtn onClick={() => setRecu((r) => Math.max(done.total, r - 500))} label="-500">
                <Minus className="size-3" aria-hidden="true" />
              </QtyBtn>
              <input
                id="montant-recu"
                type="number"
                inputMode="numeric"
                min={done.total}
                step={500}
                value={recu}
                onChange={(e) => setRecu(Math.max(0, Number(e.target.value) || 0))}
                className="w-28 rounded-xl glass border px-2 h-9 text-right font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <QtyBtn onClick={() => setRecu((r) => r + 500)} label="+500">
                <Plus className="size-3" aria-hidden="true" />
              </QtyBtn>
            </div>
          </div>
          <p className="mt-3 flex items-center justify-between border-t border-glass-border pt-3">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t("pharmacie.vente_rendu")}
            </span>
            <span
              className={cn(
                "font-mono text-base font-semibold tabular-nums",
                recu >= done.total && "text-[oklch(0.75_0.18_150)]",
              )}
            >
              {fmtAr(Math.max(0, recu - done.total))}
            </span>
          </p>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2 print:hidden">
          <GlassButton
            type="button"
            variant="glass"
            size="sm"
            onClick={() =>
              window.open(
                `/api/pharmacie/ventes/${done.venteId}/ticket`,
                "_blank",
                "noopener",
              )
            }
          >
            <Receipt className="size-3.5" aria-hidden="true" />
            {t("pharmacie.vente_ticket")}
          </GlassButton>
          <GlassButton
            type="button"
            variant="glass"
            size="sm"
            onClick={() =>
              window.open(
                `/api/pharmacie/ventes/${done.venteId}/facture`,
                "_blank",
                "noopener",
              )
            }
          >
            <FileText className="size-3.5" aria-hidden="true" />
            {t("pharmacie.vente_facture")}
          </GlassButton>
          <GlassButton
            type="button"
            variant="brand"
            size="sm"
            onClick={() => {
              setPanier([]);
              setClientNom("");
              setDone(null);
              setRecu(0);
            }}
          >
            {t("pharmacie.vente_new")}
          </GlassButton>
        </div>
      </GlassCard>
    );
  }

  // -------- Écran de vente --------
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Recherche produit */}
      <div className="lg:col-span-3 space-y-4">
        <div className="relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("pharmacie.vente_search_placeholder")}
            aria-label={t("pharmacie.vente_search_placeholder")}
            className="w-full h-12 rounded-2xl glass border pl-11 pr-4 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
            autoFocus
          />
        </div>

        {resultats.length > 0 && (
          <GlassCard className="p-2">
            <ul role="list" className="divide-y divide-glass-border">
              {resultats.map((p) => {
                // Sans prix de vente, la caisse encaisserait 0 Ar : le
                // serveur refuse la vente, autant l'annoncer ici et
                // renvoyer vers la fiche produit plutôt que de laisser
                // composer un panier qui sera rejeté.
                const sansPrix = !p.prix_vente || p.prix_vente <= 0;
                const infos = (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-tight truncate">
                        {p.designation}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {p.dci || p.classe || p.id}
                        {p.dosage ? ` · ${p.dosage}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
                      {t("pharmacie.vente_stock_dispo", { n: p.stockBase })}
                    </span>
                  </>
                );
                const classeLigne =
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
                return (
                  <li key={p.id}>
                    {sansPrix ? (
                      // Le produit n'est pas vendable : on mène à la fiche
                      // pour saisir le prix, au lieu d'un bouton mort.
                      <Link href={`/pharmacie/produits/${p.id}`} className={classeLigne}>
                        {infos}
                        <span className="rounded-full border border-[oklch(0.82_0.16_85_/_0.3)] bg-[oklch(0.82_0.16_85_/_0.12)] px-2 py-0.5 text-[10px] font-medium text-[oklch(0.82_0.16_85)] whitespace-nowrap shrink-0">
                          {t("pharmacie.vente_sans_prix_badge")}
                        </span>
                        <Pencil
                          className="size-3.5 text-muted-foreground shrink-0"
                          aria-hidden="true"
                        />
                        <span className="sr-only">{t("pharmacie.vente_sans_prix_aide")}</span>
                      </Link>
                    ) : (
                      <button type="button" onClick={() => ajouter(p)} className={classeLigne}>
                        {infos}
                        <span className="font-mono text-sm tabular-nums shrink-0">
                          {fmtAr(p.prix_vente)}
                        </span>
                        <Plus className="size-4 text-primary shrink-0" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </GlassCard>
        )}

        {query.trim().length >= 2 && resultats.length === 0 && (
          <p className="text-sm text-muted-foreground px-2">
            {t("pharmacie.vente_no_result")}
          </p>
        )}
      </div>

      {/* Panier */}
      <div className="lg:col-span-2">
        <GlassCard className="p-5 sticky top-24">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <ShoppingCart className="size-4 text-primary" aria-hidden="true" />
            {t("pharmacie.vente_panier")} ({panier.length})
          </h2>

          {panier.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {t("pharmacie.vente_panier_vide")}
            </p>
          ) : (
            <ul role="list" className="mt-4 space-y-3">
              {panier.map((l) => (
                <li key={l.produit.id} className="rounded-xl glass border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-tight flex-1">
                      {l.produit.designation}
                    </p>
                    <button
                      type="button"
                      onClick={() => changerQuantite(l.produit.id, -l.quantite)}
                      aria-label={t("actions.delete")}
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="inline-flex items-center gap-1">
                      <QtyBtn
                        onClick={() => changerQuantite(l.produit.id, -1)}
                        label="-"
                      >
                        <Minus className="size-3" aria-hidden="true" />
                      </QtyBtn>
                      <span className="w-8 text-center font-mono text-sm tabular-nums">
                        {l.quantite}
                      </span>
                      <QtyBtn
                        onClick={() => changerQuantite(l.produit.id, 1)}
                        disabled={l.quantite >= l.produit.stockBase}
                        label="+"
                      >
                        <Plus className="size-3" aria-hidden="true" />
                      </QtyBtn>
                    </div>
                    <span className="font-mono text-sm tabular-nums">
                      {fmtAr(l.quantite * (l.produit.prix_vente || 0))}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 space-y-3 border-t border-glass-border pt-4">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                {t("pharmacie.vente_client")} ({t("common.optional")})
              </span>
              <input
                type="text"
                value={clientNom}
                onChange={(e) => setClientNom(e.target.value)}
                placeholder={t("pharmacie.vente_client_placeholder")}
                className="w-full rounded-xl glass border px-3.5 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>

            <div>
              <p className="flex items-center justify-between text-lg font-semibold">
                <span>{t("pharmacie.vente_total")}</span>
                <span className="font-mono tabular-nums">{fmtAr(total)}</span>
              </p>
              <p className="flex justify-end text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">= {fmtFmg(total)}</span>
              </p>
            </div>

            <GlassButton
              type="button"
              variant="brand"
              size="lg"
              className="w-full"
              disabled={panier.length === 0 || loading}
              onClick={encaisser}
            >
              {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {t("pharmacie.vente_encaisser")}
            </GlassButton>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function QtyBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-lg glass border",
        "hover:bg-white/8 transition-colors disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
      )}
    >
      {children}
    </button>
  );
}
