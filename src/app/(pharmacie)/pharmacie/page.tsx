import type { Metadata } from "next";
import Link from "next/link";
import {
  Pill,
  AlertTriangle,
  CalendarClock,
  Banknote,
  Trash2,
  ShoppingCart,
  PackagePlus,
  History,
} from "lucide-react";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { can } from "@/lib/auth/permissions";
import { listProduitsAvecStock } from "@/lib/pharmacie/sheets";
import { formaterQuantite, prixParUniteBase } from "@/lib/pharmacie/fractionnement";
import { STATUT_LABELS, type ProduitAvecStock } from "@/lib/pharmacie/types";
import { safe, isConfigError } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pharmacie" };

function fmtAr(n: number): string {
  return (
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) +
    " Ar"
  );
}

export default async function PharmaciePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const lang = session.user.lang;
  const t = getT(lang);

  const res = await safe<ProduitAvecStock[]>(() => listProduitsAvecStock(), []);
  const produits = res.data;
  const configIssue = isConfigError(res.error);

  const actifs = produits.filter((p) => p.statut === "actif");
  const aDetruire = produits.filter((p) => p.statut === "a_detruire");
  const perimes = actifs.filter(
    (p) => p.joursAvantPeremption !== null && p.joursAvantPeremption < 0,
  );
  const bientotPerimes = actifs.filter(
    (p) =>
      p.joursAvantPeremption !== null &&
      p.joursAvantPeremption >= 0 &&
      p.joursAvantPeremption <= 90,
  );
  // stockBase et stock_min sont dans la MÊME unité (unités de base) :
  // la comparaison est juste par construction, sans conversion.
  const ruptures = actifs.filter((p) => p.stockBase <= 0);
  const sousStockMin = actifs.filter(
    (p) => p.stockBase > 0 && p.stock_min > 0 && p.stockBase <= p.stock_min,
  );
  // Valorisation : prixParUniteBase() et NON prix_vente. Le stock est en
  // unités de base ; multiplier par le prix de la BOÎTE surévaluerait d'un
  // facteur 30 sur un produit fractionné — faux, et invisible pour le
  // compilateur (number × number).
  const valeurStock = actifs.reduce(
    (sum, p) => sum + p.stockBase * prixParUniteBase(p),
    0,
  );

  // Liste de réapprovisionnement groupée par fournisseur (logique reprise
  // de l'app d'Eugenio) : quantité à commander = seuil min − stock actuel.
  const aCommander = [...ruptures, ...sousStockMin];
  const parFournisseur = new Map<string, ProduitAvecStock[]>();
  for (const p of aCommander) {
    const cle = p.fournisseur.trim();
    parFournisseur.set(cle, [...(parFournisseur.get(cle) ?? []), p]);
  }
  const groupesFournisseur = [...parFournisseur.entries()].sort(
    // Fournisseurs par ordre alphabétique, « sans fournisseur » ("") en dernier
    ([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)),
  );

  return (
    <main id="main-content" className="mx-auto max-w-7xl flex-1 p-4 md:p-10 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {t("pharmacie.eyebrow")}
          </p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl font-semibold tracking-tight">
            {t("pharmacie.title")}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm md:text-base">
            {t("pharmacie.subtitle", { n: actifs.length })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/pharmacie/ventes">
            <GlassButton variant="glass" size="md">
              <History className="size-4" aria-hidden="true" />
              {t("pharmacie.ventes_cta")}
            </GlassButton>
          </Link>
          {can(session.user.role, "pharmacie:stock") && (
            <Link href="/pharmacie/reception">
              <GlassButton variant="glass" size="md">
                <PackagePlus className="size-4" aria-hidden="true" />
                {t("pharmacie.reception_cta")}
              </GlassButton>
            </Link>
          )}
          {can(session.user.role, "pharmacie:vendre") && (
            <Link href="/pharmacie/vente">
              <GlassButton variant="brand" size="md" shimmer>
                <ShoppingCart className="size-4" aria-hidden="true" />
                {t("pharmacie.vente_cta")}
              </GlassButton>
            </Link>
          )}
        </div>
      </div>

      {produits.length === 0 ? (
        <SheetEmptyState
          title={t("pharmacie.empty_title")}
          description={t("pharmacie.empty_desc")}
          configError={configIssue}
        />
      ) : (
        <>
          {/* KPIs */}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi
              icon={<Pill className="size-5" />}
              label={t("pharmacie.kpi_produits")}
              value={String(actifs.length)}
              hint={t("pharmacie.kpi_produits_hint", { n: aDetruire.length })}
              tone="success"
            />
            <Kpi
              icon={<Banknote className="size-5" />}
              label={t("pharmacie.kpi_valeur")}
              value={fmtAr(valeurStock)}
              hint={t("pharmacie.kpi_valeur_hint")}
              tone="cyan"
            />
            <Kpi
              icon={<CalendarClock className="size-5" />}
              label={t("pharmacie.kpi_peremption")}
              value={String(bientotPerimes.length)}
              hint={t("pharmacie.kpi_peremption_hint")}
              tone={bientotPerimes.length > 0 ? "warning" : "success"}
            />
            <Kpi
              icon={<AlertTriangle className="size-5" />}
              label={t("pharmacie.kpi_alertes")}
              value={String(perimes.length + aCommander.length)}
              hint={t("pharmacie.kpi_alertes_hint", {
                perimes: perimes.length,
                stock: aCommander.length,
              })}
              tone={perimes.length + aCommander.length > 0 ? "primary" : "success"}
            />
          </section>

          {/* À détruire */}
          {aDetruire.length > 0 && (
            <section aria-label={t("pharmacie.destroy_title")}>
              <GlassCard className="p-5 border-primary/30">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                  <Trash2 className="size-4 text-primary" aria-hidden="true" />
                  {t("pharmacie.destroy_title")} ({aDetruire.length})
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("pharmacie.destroy_desc")}
                </p>
                <ul role="list" className="mt-3 flex flex-wrap gap-2">
                  {aDetruire.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs"
                    >
                      {p.designation}
                      {p.prochainePeremption && (
                        <span className="text-muted-foreground">
                          {" "}· {p.prochainePeremption}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </GlassCard>
            </section>
          )}

          {/* À commander (groupé par fournisseur) */}
          {aCommander.length > 0 && (
            <section aria-label={t("pharmacie.commander_title")}>
              <GlassCard className="p-5 border-[oklch(0.82_0.16_85_/_0.3)]">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                  <ShoppingCart
                    className="size-4 text-[oklch(0.82_0.16_85)]"
                    aria-hidden="true"
                  />
                  {t("pharmacie.commander_title")} ({aCommander.length})
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("pharmacie.commander_desc")}
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {groupesFournisseur.map(([fournisseur, items]) => (
                    <div key={fournisseur || "__none__"} className="rounded-xl glass border p-4">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                        {fournisseur || t("pharmacie.commander_sans_fournisseur")}
                        <span className="ml-2 font-mono normal-case tracking-normal">
                          ({items.length})
                        </span>
                      </h3>
                      <ul role="list" className="mt-2 divide-y divide-glass-border">
                        {items.map((p) => (
                          <li
                            key={p.id}
                            className="flex items-center justify-between gap-3 py-2 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="font-medium leading-tight truncate">
                                {p.designation}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {t("pharmacie.commander_stock_seuil", {
                                  stock: formaterQuantite(p, p.stockBase),
                                  min: formaterQuantite(p, p.stock_min),
                                })}
                              </p>
                            </div>
                            {p.stockBase <= 0 && (
                              <Badge tone="primary">
                                {t("pharmacie.badge_rupture")}
                              </Badge>
                            )}
                            {Math.ceil(p.stock_min - p.stockBase) > 0 && (
                              <Badge tone="warning">
                                {t("pharmacie.commander_qte", {
                                  n: formaterQuantite(
                                    p,
                                    Math.ceil(p.stock_min - p.stockBase),
                                  ),
                                })}
                              </Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </section>
          )}

          {/* Liste produits */}
          <section aria-label={t("pharmacie.list_title")}>
            <h2 className="font-display text-lg font-semibold mb-4">
              {t("pharmacie.list_title")}
            </h2>
            <GlassCard className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t("pharmacie.list_title")}</caption>
                  <thead>
                    <tr className="border-b border-glass-border text-left">
                      <Th>{t("pharmacie.col_designation")}</Th>
                      <Th className="hidden md:table-cell">{t("pharmacie.col_classe")}</Th>
                      <Th className="text-right">{t("pharmacie.col_stock")}</Th>
                      <Th className="text-right hidden sm:table-cell">{t("pharmacie.col_prix")}</Th>
                      <Th className="hidden lg:table-cell">{t("pharmacie.col_peremption")}</Th>
                      <Th>{t("pharmacie.col_statut")}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border">
                    {actifs
                      .slice()
                      .sort((a, b) => a.designation.localeCompare(b.designation))
                      .map((p) => {
                        const perime =
                          p.joursAvantPeremption !== null && p.joursAvantPeremption < 0;
                        const bientot =
                          p.joursAvantPeremption !== null &&
                          p.joursAvantPeremption >= 0 &&
                          p.joursAvantPeremption <= 90;
                        const rupture = p.stockBase <= 0;
                        const lowStock =
                          !rupture && p.stock_min > 0 && p.stockBase <= p.stock_min;
                        return (
                          <tr key={p.id} className="hover:bg-white/3 transition-colors">
                            <td className="px-4 py-3">
                              <Link
                                href={`/pharmacie/produits/${p.id}`}
                                className="group/link block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                              >
                                <p className="font-medium leading-tight group-hover/link:text-primary transition-colors">
                                  {p.designation}
                                </p>
                                <p className="text-[11px] text-muted-foreground font-mono">
                                  {p.id}
                                  {p.dosage ? ` · ${p.dosage}` : ""}
                                </p>
                              </Link>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                              {p.classe || "—"}
                            </td>
                            <td
                              className={cn(
                                "px-4 py-3 text-right font-mono tabular-nums",
                                rupture && "text-primary font-semibold",
                                lowStock && "text-[oklch(0.82_0.16_85)] font-semibold",
                              )}
                            >
                              {formaterQuantite(p, p.stockBase)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums hidden sm:table-cell">
                              {p.prix_vente ? fmtAr(p.prix_vente) : "—"}
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              {p.prochainePeremption ? (
                                <span
                                  className={cn(
                                    "text-xs font-mono",
                                    perime && "text-primary font-semibold",
                                    bientot && "text-[oklch(0.82_0.16_85)]",
                                  )}
                                >
                                  {p.prochainePeremption}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex flex-wrap gap-1">
                                {perime && (
                                  <Badge tone="primary">{t("pharmacie.badge_perime")}</Badge>
                                )}
                                {!perime && bientot && (
                                  <Badge
                                    tone={
                                      (p.joursAvantPeremption ?? 0) <= 30
                                        ? "primary"
                                        : "warning"
                                    }
                                  >
                                    {t("pharmacie.badge_bientot", {
                                      j: p.joursAvantPeremption ?? 0,
                                    })}
                                  </Badge>
                                )}
                                {rupture && (
                                  <Badge tone="primary">{t("pharmacie.badge_rupture")}</Badge>
                                )}
                                {lowStock && (
                                  <Badge tone="warning">{t("pharmacie.badge_stock_bas")}</Badge>
                                )}
                                {!perime && !bientot && !rupture && !lowStock && (
                                  <Badge tone="success">
                                    {STATUT_LABELS[p.statut][lang]}
                                  </Badge>
                                )}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </section>
        </>
      )}
    </main>
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

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "primary" | "warning" | "success";
}) {
  const cls =
    tone === "primary"
      ? "bg-primary/12 text-primary border-primary/30"
      : tone === "warning"
        ? "bg-[oklch(0.82_0.16_85_/_0.12)] text-[oklch(0.82_0.16_85)] border-[oklch(0.82_0.16_85_/_0.3)]"
        : "bg-[oklch(0.75_0.18_150_/_0.12)] text-[oklch(0.75_0.18_150)] border-[oklch(0.75_0.18_150_/_0.3)]";
  return (
    <span
      className={cn(
        "inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
        cls,
      )}
    >
      {children}
    </span>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "primary" | "cyan" | "success" | "warning";
}) {
  const toneCls =
    tone === "primary"
      ? "bg-primary/15 text-primary"
      : tone === "cyan"
        ? "bg-accent/15 text-accent"
        : tone === "success"
          ? "bg-[oklch(0.75_0.18_150_/_0.15)] text-[oklch(0.75_0.18_150)]"
          : "bg-[oklch(0.82_0.16_85_/_0.15)] text-[oklch(0.82_0.16_85)]";
  return (
    <GlassCard className="p-6">
      <div className={cn("inline-flex size-10 items-center justify-center rounded-xl", toneCls)}>
        {icon}
      </div>
      <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl md:text-3xl font-semibold tabular-nums truncate">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </GlassCard>
  );
}
