import type { Metadata } from "next";
import Link from "next/link";
import {
  Pill,
  AlertTriangle,
  CalendarClock,
  Banknote,
  Trash2,
  ShoppingCart,
} from "lucide-react";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { PanneBanner } from "@/components/layout/panne-banner";
import { can } from "@/lib/auth/permissions";
import { listProduitsAvecStock } from "@/lib/pharmacie/sheets";
import { formaterQuantite, prixParUniteBase } from "@/lib/pharmacie/fractionnement";
import { STATUT_LABELS, estGalenique, type ProduitAvecStock } from "@/lib/pharmacie/types";
import { BadgeGalenique } from "@/components/pharmacie/badge-galenique";
import { listProformas, calculerStats } from "@/lib/pharmacie/proforma";
import { CatalogueRecherche, type LigneCatalogue } from "./catalogue-recherche";
import { SectionRepliable } from "@/components/pharmacie/section-repliable";
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

  /* Suivi des devis sur trente jours glissants. Réservé à qui pilote —
     une dispensatrice n'a rien à faire d'un taux de transformation au
     comptoir, et l'écran est déjà dense. */
  const piloteur = can(session.user.role, "pharmacie:config");
  const devis = piloteur
    ? await listProformas(new Date(Date.now() - 30 * 86_400_000).toISOString())
    : [];
  const statsDevis = calculerStats(devis);

  const produits = res.data;
  // Trois états à ne jamais confondre : la source est tombée (res.ok=false),
  // la source répond mais le stock est vide, ou tout va bien. On se fie au
  // booléen que safe() renvoie déjà, jamais à une reconnaissance de motif
  // dans le message d'erreur — isConfigError ne connaît que les erreurs
  // Google, et laissait donc une panne Supabase s'afficher « Aucun produit ».
  const panne = !res.ok;
  const configIssue = isConfigError(res.error);

  const actifs = produits.filter((p) => p.statut === "actif");
  const aDetruire = produits.filter((p) => p.statut === "a_detruire");

  /* Lignes du catalogue, calculées ICI : la conversion boîte/unité, les
     seuils et la péremption relèvent du métier et restent côté serveur,
     en un seul exemplaire. Le composant de recherche ne fait que filtrer
     et rendre — il n'a aucune règle à connaître. */
  const lignesCatalogue: LigneCatalogue[] = actifs.map((p) => {
    const perime = p.joursAvantPeremption !== null && p.joursAvantPeremption < 0;
    const bientot =
      p.joursAvantPeremption !== null &&
      p.joursAvantPeremption >= 0 &&
      p.joursAvantPeremption <= 90;
    const rupture = p.stockBase <= 0;
    const bas = !rupture && p.stock_min > 0 && p.stockBase <= p.stock_min;
    const etat: LigneCatalogue["etat"] = rupture
      ? "rupture"
      : perime
        ? "perime"
        : bas
          ? "bas"
          : bientot
            ? "bientot"
            : "ok";
    return {
      id: p.id,
      designation: p.designation,
      dci: p.dci ?? "",
      dosage: p.dosage ?? "",
      classe: p.classe ?? "",
      galenique: estGalenique(p),
      fournisseur: p.fournisseur ?? "",
      stockLibelle: rupture ? t("pharmacie.vente_stock_zero") : formaterQuantite(p, p.stockBase),
      prixLibelle: p.prix_vente ? fmtAr(prixParUniteBase(p)) : "—",
      peremption: p.prochainePeremption || "—",
      etat,
      etatLibelle: rupture
        ? t("pharmacie.badge_rupture")
        : perime
          ? t("pharmacie.badge_perime")
          : bas
            ? t("pharmacie.badge_stock_bas")
            : bientot
              ? t("pharmacie.badge_bientot", { j: String(p.joursAvantPeremption ?? 0) })
              : STATUT_LABELS[p.statut][lang],
    };
  });

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
        {/* La navigation vit désormais dans la sidebar. On ne garde ici que
            l'action de comptoir la plus fréquente : ouvrir une vente. */}
        {can(session.user.role, "pharmacie:vendre") && (
          <Link href="/pharmacie/vente">
            <GlassButton variant="brand" size="md" shimmer>
              <ShoppingCart className="size-4" aria-hidden="true" />
              {t("pharmacie.vente_cta")}
            </GlassButton>
          </Link>
        )}
      </div>

      {panne ? (
        // La source de données est injoignable. On ne montre AUCUN chiffre :
        // un stock affiché à 0 alors que la base est muette ferait vendre
        // dans le vide, ticket imprimé à l'appui.
        <PanneBanner
          titre={t("pharmacie.panne_titre")}
          consigne={t("pharmacie.panne_consigne")}
          detail={configIssue ? t("pharmacie.panne_config") : res.error}
        />
      ) : produits.length === 0 ? (
        <SheetEmptyState
          title={t("pharmacie.empty_title")}
          description={t("pharmacie.empty_desc")}
          configError={configIssue}
        />
      ) : (
        <>
          {/* Chiffres clés en BANNIÈRE, non en cartes.
              Quatre grandes tuiles occupaient tout le premier écran et
              repoussaient le stock hors de vue, alors qu'on vient ici pour
              chercher un médicament. Une ligne suffit à porter la même
              information ; ce qui appelle une action reste coloré. */}
          <GlassCard className="p-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <Chiffre
                icone={<Pill className="size-4" />}
                valeur={String(actifs.length)}
                libelle={t("pharmacie.kpi_produits")}
              />
              <Chiffre
                icone={<Banknote className="size-4" />}
                valeur={fmtAr(valeurStock)}
                libelle={t("pharmacie.kpi_valeur")}
              />
              <Chiffre
                icone={<CalendarClock className="size-4" />}
                valeur={String(bientotPerimes.length)}
                libelle={t("pharmacie.kpi_peremption")}
                ton={bientotPerimes.length > 0 ? "attention" : "neutre"}
              />
              <Chiffre
                icone={<AlertTriangle className="size-4" />}
                valeur={String(perimes.length + aCommander.length)}
                libelle={t("pharmacie.kpi_alertes")}
                ton={perimes.length + aCommander.length > 0 ? "alerte" : "neutre"}
              />
            </div>
          </GlassCard>

          {/* LE STOCK D'ABORD : c'est ce qu'on vient chercher. */}
          <CatalogueRecherche
            lignes={lignesCatalogue}
            lang={lang}
            peutModifier={can(session.user.role, "pharmacie:stock")}
          />

          {/* À détruire */}
          {aDetruire.length > 0 && (
            <SectionRepliable
              titre={t("pharmacie.destroy_title")}
              compte={aDetruire.length}
              ton="alerte"
              icone={<Trash2 className="size-4 text-primary" aria-hidden="true" />}
            >
              <div>
                <p className="text-xs text-muted-foreground">
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
              </div>
            </SectionRepliable>
          )}

          {/* À commander (groupé par fournisseur) */}
          {aCommander.length > 0 && (
            <SectionRepliable
              titre={t("pharmacie.commander_title")}
              compte={aCommander.length}
              ton="attention"
              icone={<ShoppingCart className="size-4 text-[var(--warning)]" aria-hidden="true" />}
            >
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("pharmacie.commander_desc")}
                </p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
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
              </div>
            </SectionRepliable>
          )}

        </>
      )}

      {piloteur && statsDevis.emis > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">
            {t("pharmacie.devis_suivi_titre")}
          </h2>
          <GlassCard className="p-6">
            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {t("pharmacie.devis_emis")}
                </p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                  {statsDevis.emis}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fmtAr(statsDevis.montantEmis)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {t("pharmacie.devis_transformes")}
                </p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-[var(--success)]">
                  {statsDevis.transformes}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fmtAr(statsDevis.montantTransforme)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {t("pharmacie.devis_taux")}
                </p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-accent">
                  {statsDevis.taux} %
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("pharmacie.devis_periode")}
                </p>
              </div>
            </div>
            <p className="mt-4 border-t border-glass-border pt-3 text-xs text-muted-foreground">
              {t("pharmacie.devis_suivi_aide")}
            </p>
          </GlassCard>
        </section>
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
        ? "bg-[var(--warning)/12] text-[var(--warning)] border-[var(--warning)/30]"
        : "bg-[var(--success)/12] text-[var(--success)] border-[var(--success)/30]";
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

/** Chiffre clé de la bannière : une ligne, pas une tuile. */
function Chiffre({
  icone,
  valeur,
  libelle,
  ton = "neutre",
}: {
  icone: React.ReactNode;
  valeur: string;
  libelle: string;
  ton?: "neutre" | "attention" | "alerte";
}) {
  const couleur =
    ton === "alerte"
      ? "text-primary"
      : ton === "attention"
        ? "text-[var(--warning)]"
        : "text-muted-foreground";
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={cn("self-center", couleur)} aria-hidden="true">
        {icone}
      </span>
      <span className={cn("font-display text-lg font-semibold tabular-nums", ton !== "neutre" && couleur)}>
        {valeur}
      </span>
      <span className="text-xs text-muted-foreground">{libelle}</span>
    </span>
  );
}
