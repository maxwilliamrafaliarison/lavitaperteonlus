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
import type { ProduitAvecStock, ModeVente, EntitePec } from "@/lib/pharmacie/types";
import {
  estFractionnable,
  prixPour,
  versUnitesBase,
  formaterQuantite,
} from "@/lib/pharmacie/fractionnement";

import { creerVenteAction } from "./actions";

interface LignePanier {
  produit: ProduitAvecStock;
  /** Quantité dans l'unité du mode : des boîtes, ou des comprimés. */
  quantite: number;
  mode: ModeVente;
}

/** Deux lignes du même produit dans deux modes différents sont distinctes. */
const cle = (l: LignePanier) => `${l.produit.id}|${l.mode}`;

function fmtAr(n: number): string {
  return (
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) +
    " Ar"
  );
}

export function VenteForm({
  produits,
  entites,
  lang,
}: {
  produits: ProduitAvecStock[];
  entites: EntitePec[];
  lang: Lang;
}) {
  const router = useRouter();
  const t = React.useMemo(() => getT(lang), [lang]);
  const [query, setQuery] = React.useState("");
  const [panier, setPanier] = React.useState<LignePanier[]>([]);
  const [clientNom, setClientNom] = React.useState("");
  const [typeVente, setTypeVente] = React.useState<"cash" | "pec">("cash");
  const [pecPayeur, setPecPayeur] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState<{ venteId: string; total: number } | null>(null);
  const [recu, setRecu] = React.useState<number>(0);

  const estPec = typeVente === "pec";

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
    (s, l) => s + l.quantite * prixPour(l.produit, l.mode),
    0,
  );

  /**
   * Quantité maximale d'une ligne, en tenant compte de ce que les AUTRES
   * lignes du même produit consomment déjà. Sans ça, 2 boîtes + N comprimés
   * du même produit pourraient dépasser le stock à eux deux — le serveur
   * refuserait, mais après que le pharmacien a composé tout son panier.
   */
  function maxPour(ligne: LignePanier, courant: LignePanier[]): number {
    const dejaPris = courant
      .filter((l) => l.produit.id === ligne.produit.id && l.mode !== ligne.mode)
      .reduce((s, l) => s + versUnitesBase(l.produit, l.quantite, l.mode), 0);
    const dispo = ligne.produit.stockBase - dejaPris;
    const parUnite = versUnitesBase(ligne.produit, 1, ligne.mode);
    return Math.max(0, Math.floor(dispo / parUnite));
  }

  function ajouter(p: ProduitAvecStock, mode: ModeVente) {
    setPanier((prev) => {
      const existante = prev.find((l) => l.produit.id === p.id && l.mode === mode);
      const cible: LignePanier = existante ?? { produit: p, quantite: 0, mode };
      if (cible.quantite + 1 > maxPour(cible, prev)) {
        toast.warning(t("pharmacie.vente_stock_max", { p: p.designation }));
        return prev;
      }
      return existante
        ? prev.map((l) => (cle(l) === cle(cible) ? { ...l, quantite: l.quantite + 1 } : l))
        : [...prev, { produit: p, quantite: 1, mode }];
    });
    setQuery("");
  }

  function changerQuantite(k: string, delta: number) {
    setPanier((prev) =>
      prev
        .map((l) => {
          if (cle(l) !== k) return l;
          return { ...l, quantite: Math.min(l.quantite + delta, maxPour(l, prev)) };
        })
        .filter((l) => l.quantite > 0),
    );
  }

  async function encaisser() {
    if (panier.length === 0) return;
    if (estPec && pecPayeur.trim() === "") {
      toast.warning(t("pharmacie.vente_error_pec_payeur"));
      return;
    }
    setLoading(true);
    try {
      const result = await creerVenteAction({
        clientNom,
        typeVente,
        pecPayeur,
        lignes: panier.map((l) => ({
          produitId: l.produit.id,
          quantite: l.quantite,
          mode: l.mode,
          // Indicatif : le serveur relit le catalogue de toute façon.
          prixUnitaire: prixPour(l.produit, l.mode),
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
          {estPec ? (
            <p className="mb-2 rounded-lg bg-primary/10 px-2.5 py-1.5 text-primary">
              {t("pharmacie.vente_type_pec")} :{" "}
              <span className="font-medium">{pecPayeur || "—"}</span>
            </p>
          ) : (
            clientNom && (
              <p className="mb-2 text-muted-foreground">
                {t("pharmacie.vente_client")} :{" "}
                <span className="text-foreground">{clientNom}</span>
              </p>
            )
          )}
          <ul role="list" className="divide-y divide-glass-border">
            {panier.map((l) => (
              <li key={cle(l)} className="flex justify-between py-1.5">
                <span>
                  {l.produit.designation}{" "}
                  {/* « × 3 » sans l'unité, c'est un litige au comptoir :
                      3 boîtes ou 3 comprimés ? */}
                  <span className="text-muted-foreground">
                    × {l.quantite}
                    {estFractionnable(l.produit) &&
                      ` ${
                        l.mode === "detail"
                          ? l.produit.unite_detail || t("pharmacie.vente_mode_detail")
                          : "bte"
                      }`}
                  </span>
                </span>
                <span className="font-mono tabular-nums">
                  {fmtAr(l.quantite * prixPour(l.produit, l.mode))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between border-t border-glass-border pt-3 font-semibold">
            <span>{estPec ? t("pharmacie.vente_pec_valeur") : t("pharmacie.vente_total")}</span>
            <span className={cn("font-mono tabular-nums", estPec && "line-through text-muted-foreground")}>
              {fmtAr(done.total)}
            </span>
          </p>
          {estPec && (
            <p className="mt-1 flex justify-between font-semibold">
              <span>{t("pharmacie.vente_a_payer")}</span>
              <span className="font-mono tabular-nums text-[oklch(0.75_0.18_150)]">
                {fmtAr(0)}
              </span>
            </p>
          )}
        </div>

        {/* Monnaie à rendre (espèces) — sans objet en prise en charge. */}
        {!estPec && (
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
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2 print:hidden">
          <GlassButton
            type="button"
            variant="glass"
            size="sm"
            onClick={() =>
              window.open(
                // Les espèces reçues n'existent qu'ici (jamais stockées) :
                // on les passe au ticket pour afficher la monnaie rendue.
                estPec
                  ? `/api/pharmacie/ventes/${done.venteId}/ticket`
                  : `/api/pharmacie/ventes/${done.venteId}/ticket?recu=${Math.max(recu, done.total)}`,
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
              setTypeVente("cash");
              setPecPayeur("");
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
                      {formaterQuantite(p, p.stockBase)}
                    </span>
                  </>
                );
                const classeLigne =
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
                // Vendable à l'unité seulement si le produit est fractionné ET
                // qu'un prix de comptoir a été fixé pour l'unité.
                const auDetail = estFractionnable(p) && p.prix_vente_detail > 0;
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
                    ) : auDetail ? (
                      // Deux boutons : le pharmacien choisit l'unité au moment
                      // d'ajouter, pas après — c'est le geste du comptoir.
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        {infos}
                        <div className="flex gap-1.5 shrink-0">
                          <BoutonMode
                            onClick={() => ajouter(p, "boite")}
                            libelle={t("pharmacie.vente_mode_boite")}
                            prix={fmtAr(p.prix_vente)}
                          />
                          <BoutonMode
                            onClick={() => ajouter(p, "detail")}
                            libelle={p.unite_detail || t("pharmacie.vente_mode_detail")}
                            prix={fmtAr(p.prix_vente_detail)}
                            accent
                          />
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => ajouter(p, "boite")}
                        className={classeLigne}
                      >
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
              {panier.map((l) => {
                const k = cle(l);
                return (
                  <li key={k} className="rounded-xl glass border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight">
                          {l.produit.designation}
                        </p>
                        {/* L'unité doit être lisible : deux lignes du même
                            produit ne se distinguent que par elle. */}
                        {estFractionnable(l.produit) && (
                          <span
                            className={cn(
                              "mt-1 inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-medium",
                              l.mode === "detail"
                                ? "border-accent/30 bg-accent/10 text-accent"
                                : "border-glass-border text-muted-foreground",
                            )}
                          >
                            {l.mode === "detail"
                              ? l.produit.unite_detail || t("pharmacie.vente_mode_detail")
                              : t("pharmacie.vente_mode_boite")}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => changerQuantite(k, -l.quantite)}
                        aria-label={t("actions.delete")}
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="inline-flex items-center gap-1">
                        <QtyBtn onClick={() => changerQuantite(k, -1)} label="-">
                          <Minus className="size-3" aria-hidden="true" />
                        </QtyBtn>
                        <span className="w-8 text-center font-mono text-sm tabular-nums">
                          {l.quantite}
                        </span>
                        <QtyBtn
                          onClick={() => changerQuantite(k, 1)}
                          disabled={l.quantite >= maxPour(l, panier)}
                          label="+"
                        >
                          <Plus className="size-3" aria-hidden="true" />
                        </QtyBtn>
                      </div>
                      <span className="font-mono text-sm tabular-nums">
                        {fmtAr(l.quantite * prixPour(l.produit, l.mode))}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-5 space-y-3 border-t border-glass-border pt-4">
            {/* Type de vente : comptant ou prise en charge (client à 0 Ar). */}
            <div className="grid grid-cols-2 gap-2">
              <TypeBtn
                actif={!estPec}
                onClick={() => setTypeVente("cash")}
                label={t("pharmacie.vente_type_cash")}
              />
              <TypeBtn
                actif={estPec}
                onClick={() => setTypeVente("pec")}
                label={t("pharmacie.vente_type_pec")}
              />
            </div>

            {!estPec ? (
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
            ) : (
              <label className="block">
                <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                  {t("pharmacie.vente_pec_payeur")}{" "}
                  <span aria-label={t("a11y.required_indicator")} className="text-primary">*</span>
                </span>
                <input
                  type="text"
                  list="pec-entites"
                  value={pecPayeur}
                  onChange={(e) => setPecPayeur(e.target.value)}
                  placeholder={t("pharmacie.vente_pec_placeholder")}
                  className="w-full rounded-xl glass border px-3.5 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <datalist id="pec-entites">
                  {entites.map((e) => (
                    <option key={e.id} value={e.nom} />
                  ))}
                </datalist>
              </label>
            )}

            <div>
              {estPec ? (
                <>
                  <p className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{t("pharmacie.vente_pec_valeur")}</span>
                    <span className="font-mono tabular-nums line-through">{fmtAr(total)}</span>
                  </p>
                  <p className="mt-1 flex items-center justify-between text-lg font-semibold">
                    <span>{t("pharmacie.vente_a_payer")}</span>
                    <span className="font-mono tabular-nums text-[oklch(0.75_0.18_150)]">
                      {fmtAr(0)}
                    </span>
                  </p>
                </>
              ) : (
                <p className="flex items-center justify-between text-lg font-semibold">
                  <span>{t("pharmacie.vente_total")}</span>
                  <span className="font-mono tabular-nums">{fmtAr(total)}</span>
                </p>
              )}
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
              {estPec ? t("pharmacie.vente_valider_pec") : t("pharmacie.vente_encaisser")}
            </GlassButton>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

/** Bascule Comptant / Prise en charge, au-dessus du bouton d'encaissement. */
function TypeBtn({
  actif,
  onClick,
  label,
}: {
  actif: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        actif
          ? "border-primary/40 bg-primary/12 text-primary"
          : "border-glass-border text-muted-foreground hover:bg-white/5",
      )}
    >
      {label}
    </button>
  );
}

/**
 * Bouton d'ajout au panier dans une unité donnée. Le prix figure DANS le
 * bouton : au comptoir, on choisit « la boîte à 8 126 » ou « le comprimé à
 * 300 » — pas un mode abstrait qu'il faudrait traduire mentalement.
 * (Geste repris de l'app d'Eugenio.)
 */
function BoutonMode({
  onClick,
  libelle,
  prix,
  accent,
}: {
  onClick: () => void;
  libelle: string;
  prix: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center rounded-xl border px-2.5 py-1.5 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        accent
          ? "border-accent/30 bg-accent/10 hover:bg-accent/20"
          : "border-glass-border glass hover:bg-white/8",
      )}
    >
      <span className={cn("text-[10px] font-medium leading-none", accent && "text-accent")}>
        {libelle}
      </span>
      <span className="mt-0.5 font-mono text-[11px] tabular-nums leading-none">{prix}</span>
    </button>
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
