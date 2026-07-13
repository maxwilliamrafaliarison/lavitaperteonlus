"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, PackagePlus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { getT, type Lang } from "@/lib/i18n";
import type { ProduitAvecStock } from "@/lib/pharmacie/types";

import { recevoirStockAction } from "./actions";

export function ReceptionForm({
  produits,
  lang,
}: {
  produits: ProduitAvecStock[];
  lang: Lang;
}) {
  const router = useRouter();
  const t = React.useMemo(() => getT(lang), [lang]);
  const [query, setQuery] = React.useState("");
  const [selection, setSelection] = React.useState<ProduitAvecStock | null>(null);
  const [quantite, setQuantite] = React.useState(1);
  const [numeroLot, setNumeroLot] = React.useState("");
  const [dateExpiration, setDateExpiration] = React.useState("");
  const [prixUnitaire, setPrixUnitaire] = React.useState<number>(0);
  const [note, setNote] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const resultats = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return produits
      .filter(
        (p) =>
          p.designation.toLowerCase().includes(q) ||
          p.dci.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, produits]);

  function choisir(p: ProduitAvecStock) {
    setSelection(p);
    setPrixUnitaire(p.prix_achat || 0);
    setQuery("");
  }

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    if (!selection) return;
    setLoading(true);
    try {
      const result = await recevoirStockAction({
        produitId: selection.id,
        quantite,
        numeroLot,
        dateExpiration,
        prixUnitaire,
        note,
      });
      if (result.ok) {
        toast.success(t("pharmacie.reception_success"), {
          description: `${selection.designation} +${quantite}`,
        });
        setSelection(null);
        setQuantite(1);
        setNumeroLot("");
        setDateExpiration("");
        setNote("");
        router.refresh();
      } else {
        toast.error(t("common.failed"), { description: result.error });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Choix du produit */}
      {!selection ? (
        <>
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
                {resultats.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => choisir(p)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.designation}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {p.id}
                          {p.dosage ? ` · ${p.dosage}` : ""}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono tabular-nums">
                        {t("pharmacie.vente_stock_dispo", { n: p.stock })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
        </>
      ) : (
        /* Formulaire réception */
        <form onSubmit={valider}>
          <GlassCard className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold leading-tight">
                  {selection.designation}
                </h2>
                <p className="text-xs text-muted-foreground font-mono">
                  {selection.id} · {t("pharmacie.vente_stock_dispo", { n: selection.stock })}
                </p>
              </div>
              <GlassButton
                type="button"
                variant="glass"
                size="sm"
                onClick={() => setSelection(null)}
              >
                {t("common.back")}
              </GlassButton>
            </div>

            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                {t("pharmacie.reception_quantite")}{" "}
                <span aria-label={t("a11y.required_indicator")} className="text-primary">*</span>
              </span>
              <input
                type="number"
                min={1}
                max={100000}
                required
                value={quantite}
                onChange={(e) => setQuantite(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-xl glass border px-3.5 h-11 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                  {t("pharmacie.reception_lot")}
                </span>
                <input
                  type="text"
                  value={numeroLot}
                  onChange={(e) => setNumeroLot(e.target.value)}
                  placeholder="2607-A"
                  className="w-full rounded-xl glass border px-3.5 h-11 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                  {t("pharmacie.reception_expiration")}
                </span>
                <input
                  type="date"
                  value={dateExpiration}
                  onChange={(e) => setDateExpiration(e.target.value)}
                  className="w-full rounded-xl glass border px-3.5 h-11 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
            </div>

            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                {t("pharmacie.reception_prix")} (Ar)
              </span>
              <input
                type="number"
                min={0}
                value={prixUnitaire}
                onChange={(e) => setPrixUnitaire(Math.max(0, Number(e.target.value)))}
                className="w-full rounded-xl glass border px-3.5 h-11 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>

            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                {t("pharmacie.reception_note")}
              </span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder={t("pharmacie.reception_note_placeholder")}
                className="w-full rounded-xl glass border px-3.5 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>

            <GlassButton
              type="submit"
              variant="brand"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <PackagePlus className="size-4" aria-hidden="true" />
              )}
              {t("pharmacie.reception_valider")}
            </GlassButton>
          </GlassCard>
        </form>
      )}

      {!selection && query.trim().length < 2 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground px-2">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          {t("pharmacie.reception_hint")}
        </p>
      )}
    </div>
  );
}
