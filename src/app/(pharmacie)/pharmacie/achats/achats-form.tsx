"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Plus, Trash2, PackagePlus } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { getT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ProduitAvecStock, Fournisseur } from "@/lib/pharmacie/types";
import { estFractionnable, facteur } from "@/lib/pharmacie/fractionnement";

import { enregistrerAchatAction } from "./actions";

interface LigneSaisie {
  produitId: string;
  designation: string;
  facteur: number;
  fractionnable: boolean;
  uniteDetail: string;
  contenance: string;
  quantite: number;
  numeroLot: string;
  dateExpiration: string;
  montant: number;
}

function ariary(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n));
}

export function AchatsForm({
  produits,
  fournisseurs,
  lang,
}: {
  produits: ProduitAvecStock[];
  fournisseurs: Fournisseur[];
  lang: Lang;
}) {
  const router = useRouter();
  const t = React.useMemo(() => getT(lang), [lang]);

  // En-tête du document
  const [fournisseur, setFournisseur] = React.useState("");
  const [dateFacture, setDateFacture] = React.useState("");
  const [numFacture, setNumFacture] = React.useState("");
  const [numBl, setNumBl] = React.useState("");
  const [note, setNote] = React.useState("");

  // Lignes ajoutées
  const [lignes, setLignes] = React.useState<LigneSaisie[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Éditeur de ligne courante
  const [query, setQuery] = React.useState("");
  const [prod, setProd] = React.useState<ProduitAvecStock | null>(null);
  const [contenance, setContenance] = React.useState("");
  const [quantite, setQuantite] = React.useState(1);
  const [numeroLot, setNumeroLot] = React.useState("");
  const [dateExpiration, setDateExpiration] = React.useState("");
  const [montant, setMontant] = React.useState(0);

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

  const total = lignes.reduce((s, l) => s + l.montant, 0);

  function resetEditeur() {
    setProd(null);
    setQuery("");
    setContenance("");
    setQuantite(1);
    setNumeroLot("");
    setDateExpiration("");
    setMontant(0);
  }

  function ajouterLigne() {
    if (!prod || quantite < 1) return;
    setLignes((prev) => [
      ...prev,
      {
        produitId: prod.id,
        designation: prod.designation,
        facteur: facteur(prod),
        fractionnable: estFractionnable(prod),
        uniteDetail: prod.unite_detail || t("pharmacie.vente_mode_detail"),
        contenance,
        quantite,
        numeroLot,
        dateExpiration,
        montant,
      },
    ]);
    resetEditeur();
  }

  function retirer(i: number) {
    setLignes((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function enregistrer() {
    if (lignes.length === 0) return;
    setLoading(true);
    try {
      const r = await enregistrerAchatAction({
        dateFacture,
        fournisseur,
        numFacture,
        numBl,
        note,
        lignes: lignes.map((l) => ({
          produitId: l.produitId,
          contenance: l.contenance,
          quantite: l.quantite,
          numeroLot: l.numeroLot,
          dateExpiration: l.dateExpiration,
          montant: l.montant,
        })),
      });
      if (r.ok) {
        toast.success(t("pharmacie.achats_success"), {
          description: `${lignes.length} ligne(s) · ${ariary(total)} Ar`,
        });
        setLignes([]);
        setFournisseur("");
        setDateFacture("");
        setNumFacture("");
        setNumBl("");
        setNote("");
        resetEditeur();
        router.refresh();
      } else {
        toast.error(t("common.failed"), { description: r.error });
      }
    } finally {
      setLoading(false);
    }
  }

  const champ =
    "w-full rounded-xl glass border px-3.5 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
  const label =
    "block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5";

  return (
    <div className="space-y-5">
      {/* En-tête facture / BL */}
      <GlassCard className="p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">
          {t("pharmacie.achats_header")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>{t("pharmacie.achats_origine")}</span>
            <input
              type="text"
              list="fournisseurs-list"
              value={fournisseur}
              onChange={(e) => setFournisseur(e.target.value)}
              placeholder="Sopharmad…"
              className={champ}
            />
            <datalist id="fournisseurs-list">
              {fournisseurs.map((f) => (
                <option key={f.id} value={f.nom} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className={label}>{t("pharmacie.achats_date_facture")}</span>
            <input
              type="date"
              value={dateFacture}
              onChange={(e) => setDateFacture(e.target.value)}
              className={cn(champ, "font-mono")}
            />
          </label>
          <label className="block">
            <span className={label}>{t("pharmacie.achats_num_facture")}</span>
            <input
              type="text"
              value={numFacture}
              onChange={(e) => setNumFacture(e.target.value)}
              placeholder="FA-2026-…"
              className={cn(champ, "font-mono")}
            />
          </label>
          <label className="block">
            <span className={label}>{t("pharmacie.achats_num_bl")}</span>
            <input
              type="text"
              value={numBl}
              onChange={(e) => setNumBl(e.target.value)}
              placeholder="BL-…"
              className={cn(champ, "font-mono")}
            />
          </label>
        </div>
        <label className="block">
          <span className={label}>{t("pharmacie.achats_note")}</span>
          <input
            type="text"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            className={champ}
          />
        </label>
      </GlassCard>

      {/* Éditeur de ligne */}
      <GlassCard className="p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">
          {t("pharmacie.achats_lignes")}
        </h2>

        {!prod ? (
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("pharmacie.achats_search_ph")}
              aria-label={t("pharmacie.achats_search_ph")}
              className="w-full h-12 rounded-2xl glass border pl-11 pr-4 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
            />
            {resultats.length > 0 && (
              <ul
                role="list"
                className="mt-2 divide-y divide-glass-border rounded-xl glass border p-1"
              >
                {resultats.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setProd(p);
                        setMontant(0);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium text-sm truncate">
                          {p.designation}
                        </span>
                        <span className="block text-[11px] text-muted-foreground truncate">
                          {p.id}
                          {p.dosage ? ` · ${p.dosage}` : ""}
                          {estFractionnable(p)
                            ? ` · ${facteur(p)} ${p.unite_detail || ""}/bte`
                            : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim().length < 2 && (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("pharmacie.achats_vide_produit")}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-sm">{prod.designation}</p>
                <p className="text-[11px] text-muted-foreground font-mono">{prod.id}</p>
              </div>
              <button
                type="button"
                onClick={resetEditeur}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {t("common.back")}
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={label}>{t("pharmacie.achats_contenance")}</span>
                <input
                  type="text"
                  value={contenance}
                  onChange={(e) => setContenance(e.target.value)}
                  placeholder={t("pharmacie.achats_contenance_ph")}
                  className={champ}
                />
              </label>
              <label className="block">
                <span className={label}>{t("pharmacie.achats_quantite")}</span>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={quantite}
                  onChange={(e) => setQuantite(Math.max(1, Math.trunc(Number(e.target.value))))}
                  className={cn(champ, "font-mono")}
                />
                {estFractionnable(prod) ? (
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {t("pharmacie.achats_conv", {
                      n: quantite * facteur(prod),
                      u: prod.unite_detail || t("pharmacie.vente_mode_detail"),
                    })}
                  </span>
                ) : null}
              </label>
              <label className="block">
                <span className={label}>{t("pharmacie.achats_lot")}</span>
                <input
                  type="text"
                  value={numeroLot}
                  onChange={(e) => setNumeroLot(e.target.value)}
                  placeholder="2607-A"
                  className={cn(champ, "font-mono")}
                />
              </label>
              <label className="block">
                <span className={label}>{t("pharmacie.achats_peremption")}</span>
                <input
                  type="date"
                  value={dateExpiration}
                  onChange={(e) => setDateExpiration(e.target.value)}
                  className={cn(champ, "font-mono")}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className={label}>{t("pharmacie.achats_montant")}</span>
                <input
                  type="number"
                  min={0}
                  value={montant}
                  onChange={(e) => setMontant(Math.max(0, Number(e.target.value)))}
                  className={cn(champ, "font-mono")}
                />
              </label>
            </div>

            <GlassButton
              type="button"
              variant="glass"
              size="md"
              className="w-full"
              onClick={ajouterLigne}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("pharmacie.achats_ajouter_ligne")}
            </GlassButton>
          </div>
        )}

        {/* Table des lignes saisies */}
        {lignes.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-glass-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-glass-border text-left">
                  <th className="px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
                    {t("pharmacie.achats_produit")}
                  </th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium text-right">
                    {t("pharmacie.achats_quantite")}
                  </th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
                    {t("pharmacie.achats_lot")}
                  </th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium text-right">
                    {t("pharmacie.achats_montant")}
                  </th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border">
                {lignes.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2.5">
                      <span className="block font-medium">{l.designation}</span>
                      {l.contenance ? (
                        <span className="block text-[11px] text-muted-foreground">
                          {l.contenance}
                          {l.dateExpiration ? ` · exp. ${l.dateExpiration}` : ""}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {l.quantite}
                      {l.fractionnable ? (
                        <span className="block text-[10px] text-muted-foreground">
                          {l.quantite * l.facteur} {l.uniteDetail}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">{l.numeroLot || "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {ariary(l.montant)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => retirer(i)}
                        aria-label={t("pharmacie.achats_retirer")}
                        className="text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-glass-border">
                  <td colSpan={3} className="px-3 py-2.5 text-right font-medium">
                    {t("pharmacie.achats_total")}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">
                    {ariary(total)} Ar
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <GlassButton
          type="button"
          variant="brand"
          size="lg"
          className="w-full"
          onClick={enregistrer}
          disabled={loading || lignes.length === 0}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <PackagePlus className="size-4" aria-hidden="true" />
          )}
          {t("pharmacie.achats_enregistrer")}
        </GlassButton>
      </GlassCard>
    </div>
  );
}
