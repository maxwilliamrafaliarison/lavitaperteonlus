"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Receipt, FileText, Ban, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { getT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { VenteResume } from "@/lib/pharmacie/sheets";

import { annulerVenteAction, detailVenteAction } from "./actions";

interface DetailVente {
  lignes: Array<{
    designation: string;
    dosage: string;
    quantite: number;
    prixUnitaire: number;
    sousTotal: number;
    galenique: boolean;
  }>;
  pecPayeur: string;
}

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
      timeZone: "Indian/Antananarivo",

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
  /* Instant d'armement de la confirmation.
     Un double clic rapide franchissait les DEUX étapes d'un coup : le
     premier clic armait, le second annulait la vente — la garde ne gardait
     rien. On impose un court délai pendant lequel le second clic ne prend
     pas, le temps que l'œil enregistre le changement de libellé. */
  const [armeA, setArmeA] = React.useState(0);
  const DELAI_GARDE_MS = 700;
  const [loadingId, setLoadingId] = React.useState<string | null>(null);

  /* Détail d'une vente : quels médicaments, en quelle quantité, à quel
     prix. Chargé À LA DEMANDE et mémorisé — une journée chargée porte
     plusieurs centaines de lignes qu'on n'ouvrira jamais, les faire
     voyager avec la liste ralentirait la page pour rien. */
  const [ouvert, setOuvert] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState<Record<string, DetailVente>>({});
  const [chargeId, setChargeId] = React.useState<string | null>(null);

  async function basculerDetail(venteId: string) {
    if (ouvert === venteId) {
      setOuvert(null);
      return;
    }
    setOuvert(venteId);
    if (details[venteId]) return; // déjà connu : pas de second aller-retour
    setChargeId(venteId);
    try {
      const r = await detailVenteAction(venteId);
      if (r.ok) {
        setDetails((d) => ({ ...d, [venteId]: { lignes: r.lignes, pecPayeur: r.pecPayeur } }));
      } else {
        toast.error(t("common.failed"), { description: r.error });
        setOuvert(null);
      }
    } finally {
      setChargeId(null);
    }
  }

  /* ------------------------------------------------------------------
     REGROUPEMENT PAR JOURNÉE

     Une liste continue de plusieurs centaines de lignes ne se lit pas :
     on cherche « ce qu'a fait telle journée », pas « la 137ᵉ vente ».
     Chaque jour devient donc un bloc avec son total encaissé, replié
     par défaut sauf le plus récent — celui qu'on vient consulter.
     ------------------------------------------------------------------ */
  const [mois, setMois] = React.useState("");
  const [type, setType] = React.useState<"tous" | "cash" | "pec">("tous");
  const [masquerAnnulees, setMasquerAnnulees] = React.useState(false);

  /** Clé de journée en heure des centres, jamais en UTC. */
  const jourDe = React.useCallback((iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Indian/Antananarivo" });
    } catch {
      return iso.slice(0, 10);
    }
  }, []);

  const moisDisponibles = React.useMemo(
    () => [...new Set(ventes.map((v) => jourDe(v.timestamp).slice(0, 7)))].sort().reverse(),
    [ventes, jourDe],
  );

  const filtrees = React.useMemo(
    () =>
      ventes.filter((v) => {
        if (mois && !jourDe(v.timestamp).startsWith(mois)) return false;
        if (type !== "tous" && (v.typeVente || "cash") !== type) return false;
        if (masquerAnnulees && v.statut === "annulee") return false;
        return true;
      }),
    [ventes, mois, type, masquerAnnulees, jourDe],
  );

  const journees = React.useMemo(() => {
    const par = new Map<string, VenteResume[]>();
    for (const v of filtrees) {
      const j = jourDe(v.timestamp);
      const l = par.get(j);
      if (l) l.push(v);
      else par.set(j, [v]);
    }
    return [...par.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([jour, lignes]) => {
        /* Une vente annulée n'a rien encaissé : elle reste VISIBLE — la
           traçabilité l'exige — mais ne compte pas dans le total. */
        const actives = lignes.filter((v) => v.statut !== "annulee");
        return {
          jour,
          lignes,
          nb: actives.length,
          nbAnnulees: lignes.length - actives.length,
          encaisse: actives
            .filter((v) => (v.typeVente || "cash") !== "pec")
            .reduce((s, v) => s + v.total, 0),
          pec: actives.filter((v) => (v.typeVente || "cash") === "pec").length,
        };
      });
  }, [filtrees, jourDe]);

  const totalPeriode = journees.reduce((s, j) => s + j.encaisse, 0);

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
    } catch {
      // Coupure réseau : sans ce filet, la promesse rejetait en silence — le
      // spinner s'arrêtait, rien ne s'affichait, et l'opératrice recliquait.
      toast.error(t("common.reseau_titre"), { description: t("common.reseau_aide"), duration: 10000 });
    } finally {
      setLoadingId(null);
      setConfirmId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* ---- Filtres : la synthèse avant le détail ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={mois}
          onChange={(e) => setMois(e.target.value)}
          aria-label={t("pharmacie.ventes_filtre_mois")}
          className="h-9 rounded-xl border border-glass-border bg-transparent px-3 text-xs font-medium"
        >
          <option value="">{t("pharmacie.ventes_filtre_mois")}</option>
          {moisDisponibles.map((m) => (
            <option key={m} value={m}>
              {libelleMois(m, lang)}
            </option>
          ))}
        </select>

        {(["tous", "cash", "pec"] as const).map((cle) => (
          <button
            key={cle}
            type="button"
            onClick={() => setType(cle)}
            aria-pressed={type === cle}
            className={cn(
              "h-9 rounded-xl border px-3 text-xs font-medium transition-colors",
              type === cle
                ? "border-accent bg-accent/12 text-accent"
                : "border-glass-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`pharmacie.ventes_filtre_${cle}`)}
          </button>
        ))}

        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-glass-border px-3 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={masquerAnnulees}
            onChange={(e) => setMasquerAnnulees(e.target.checked)}
            className="size-3.5 accent-[var(--primary)]"
          />
          {t("pharmacie.ventes_filtre_masquer_annulees")}
        </label>

        <span className="ml-auto text-sm">
          <span className="text-muted-foreground">{t("pharmacie.ventes_total_periode")} </span>
          <span className="font-mono font-semibold tabular-nums">{fmtAr(totalPeriode)}</span>
        </span>
      </div>

      {journees.length === 0 && (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">
          {t("pharmacie.ventes_aucune_pour_filtre")}
        </GlassCard>
      )}

      {journees.map((j, index) => (
        <details
          key={j.jour}
          /* Seule la journée la plus récente s'ouvre : c'est celle qu'on
             vient consulter. Les précédentes se demandent. */
          open={index === 0}
          className="group rounded-2xl border border-glass-border glass overflow-hidden"
        >
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-foreground/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
            <span className="font-display text-base font-semibold">
              {libelleJour(j.jour, lang)}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("pharmacie.ventes_n_ventes", { n: j.nb })}
              {j.pec > 0 ? ` · ${j.pec} PEC` : ""}
              {j.nbAnnulees > 0 ? ` · ${j.nbAnnulees} ${t("pharmacie.annul_badge").toLowerCase()}` : ""}
            </span>
            <span className="ml-auto font-mono text-base font-semibold tabular-nums">
              {fmtAr(j.encaisse)}
            </span>
          </summary>

          <div className="overflow-x-auto border-t border-glass-border">
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
            {j.lignes.map((v) => {
              const annulee = v.statut === "annulee";
              const busy = loadingId === v.id;
              const estOuvert = ouvert === v.id;
              return (
                <React.Fragment key={v.id}>
                <tr
                  onClick={() => basculerDetail(v.id)}
                  className={cn(
                    "cursor-pointer hover:bg-foreground/5 transition-colors",
                    annulee && "opacity-55",
                    estOuvert && "bg-accent/8",
                  )}
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    <ChevronRight
                      className={cn(
                        "mr-1.5 inline size-3 text-muted-foreground transition-transform",
                        estOuvert && "rotate-90",
                      )}
                      aria-hidden="true"
                    />
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
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                            confirmId === v.id
                              ? Date.now() - armeA >= DELAI_GARDE_MS && annuler(v)
                              : (setConfirmId(v.id), setArmeA(Date.now()))
                          }
                          className={cn(
                            "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
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

                {estOuvert && (
                  <tr className="bg-accent/5">
                    <td colSpan={7} className="px-4 pb-4 pt-1">
                      {chargeId === v.id ? (
                        <p className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          {t("common.loading")}
                        </p>
                      ) : details[v.id] ? (
                        <DetailLignes
                          detail={details[v.id]}
                          total={v.total}
                          typeVente={v.typeVente}
                          lang={lang}
                          t={t}
                        />
                      ) : null}
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
          </div>
        </details>
      ))}
    </div>
  );
}

/** « mercredi 6 août 2026 » — la journée telle qu'on en parle. */
function libelleJour(jour: string, lang: Lang): string {
  try {
    return new Date(`${jour}T12:00:00Z`).toLocaleDateString(
      lang === "it" ? "it-IT" : "fr-FR",
      { weekday: "long", day: "numeric", month: "long", year: "numeric" },
    );
  } catch {
    return jour;
  }
}

/** « août 2026 » pour le sélecteur de mois. */
function libelleMois(mois: string, lang: Lang): string {
  try {
    return new Date(`${mois}-01T12:00:00Z`).toLocaleDateString(
      lang === "it" ? "it-IT" : "fr-FR",
      { month: "long", year: "numeric" },
    );
  } catch {
    return mois;
  }
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
      // 36 px plutôt que 28 : ces boutons servent debout, au comptoir, et
      // parfois au doigt sur l'écran tactile de la caisse.
      className="inline-flex size-9 items-center justify-center rounded-lg glass border border-glass-border text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {children}
    </button>
  );
}

/* ============================================================
   DÉTAIL D'UNE VENTE — ce qui a réellement été délivré
   ============================================================
   « 21 400 Ar » ne dit rien de ce que le patient a emporté. Cette vue
   répond à la seule question qu'on se pose en rouvrant une vente : quels
   médicaments, en quelle quantité, à quel prix.
   ============================================================ */
function DetailLignes({
  detail,
  total,
  typeVente,
  lang,
  t,
}: {
  detail: DetailVente;
  total: number;
  typeVente: string;
  lang: Lang;
  t: ReturnType<typeof getT>;
}) {
  const estPec = (typeVente || "cash") === "pec";
  return (
    <div className="rounded-xl border border-glass-border bg-background/40 p-3">
      {estPec && detail.pecPayeur && (
        <p className="mb-2 text-xs">
          <span className="text-muted-foreground">{t("pharmacie.vente_pec_payeur")} </span>
          <span className="font-medium">{detail.pecPayeur}</span>
        </p>
      )}

      {detail.lignes.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">{t("pharmacie.detail_aucune_ligne")}</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-glass-border text-left text-muted-foreground">
              <th scope="col" className="py-1.5 font-medium">{t("pharmacie.col_designation")}</th>
              <th scope="col" className="py-1.5 text-right font-medium">{t("pharmacie.detail_qte")}</th>
              <th scope="col" className="py-1.5 text-right font-medium">{t("pharmacie.detail_pu")}</th>
              <th scope="col" className="py-1.5 text-right font-medium">{t("pharmacie.vente_total")}</th>
            </tr>
          </thead>
          <tbody>
            {detail.lignes.map((l, i) => (
              <tr key={i} className="border-b border-glass-border/50 last:border-0">
                <td className="py-1.5 pr-2">
                  <span className="font-medium">{l.designation}</span>
                  {l.dosage ? (
                    <span className="text-muted-foreground"> · {l.dosage}</span>
                  ) : null}
                  {l.galenique && (
                    <span className="ml-1.5 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-px text-[9px] text-accent">
                      {t("pharmacie.cat_galenique")}
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums">{l.quantite}</td>
                <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                  {fmtAr(l.prixUnitaire)}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums font-medium">
                  {fmtAr(l.sousTotal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-foreground/20">
              <td colSpan={3} className="py-2 text-right font-medium">
                {estPec ? t("pharmacie.vente_pec_valeur") : t("pharmacie.vente_total")}
              </td>
              <td className="py-2 text-right font-mono text-sm font-semibold tabular-nums">
                {fmtAr(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
