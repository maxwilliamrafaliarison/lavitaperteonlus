import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, TrendingDown } from "lucide-react";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { ObsolescenceBadge } from "@/components/materials/obsolescence-badge";
import { MaterialTypeIcon } from "@/components/materials/type-icon";
import {
  BarreEmpilee,
  BarreRepere,
  Mesure,
  Pastille,
  tonDuScore,
} from "@/components/dashboard/micrographiques";
import { AgeHistogram } from "@/components/dashboard/age-histogram";
import { SiteBreakdown } from "@/components/dashboard/site-breakdown";
import { TypeBreakdown } from "@/components/dashboard/type-breakdown";
import { BudgetCard, fmtAriary } from "@/components/dashboard/budget-card";
import { RoomHeatmap } from "@/components/dashboard/room-heatmap";
import { CsvExportButton } from "@/components/dashboard/csv-export-button";
import { ROLE_LABELS, type Material, type Site, type Room } from "@/types";
import { listMaterials } from "@/lib/sheets/materials";
import { listSites, listRooms } from "@/lib/sheets/sites";
import { safe } from "@/lib/sheets/safe";
import { scoreObsolescence } from "@/lib/obsolescence";
import {
  distributionByLevel,
  statsBySite,
  statsByType,
  statsByRoom,
  ageHistogram,
  estimateReplacementBudget,
} from "@/lib/dashboard-stats";
import { getT } from "@/lib/i18n";
import { getFirstName } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { name, role, lang } = session.user;
  const t = getT(lang);

  const [materialsRes, sitesRes, roomsRes] = await Promise.all([
    safe<Material[]>(() => listMaterials(), []),
    safe<Site[]>(() => listSites(), []),
    safe<Room[]>(() => listRooms(), []),
  ]);

  const materials = materialsRes.data;
  const sites = sitesRes.data;
  const rooms = roomsRes.data;

  // Agrégations Phase 5
  const distribution = distributionByLevel(materials);
  const siteStats = statsBySite(materials, sites);
  const typeStats = statsByType(materials, lang);
  const roomStats = statsByRoom(materials, rooms, sites);
  const ageBuckets = ageHistogram(materials);
  const budget = estimateReplacementBudget(materials, lang);

  const scores = materials.map((m) => scoreObsolescence(m));
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((s, x) => s + x.score, 0) / scores.length)
      : 0;

  // Top 5 à remplacer
  const worstMaterials = materials
    .map((m) => ({ material: m, ...scoreObsolescence(m) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  return (
    <>

      {/* Rythme vertical : 32 px entre sections, 24 px dans une section.
          L'échelle est fermée, comme celle de Stripe : rien entre les deux,
          donc aucune section ne peut « peser » plus qu'une autre par accident. */}
      <main id="main-content" className="flex-1 p-4 md:p-8 space-y-8">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {ROLE_LABELS[role][lang]}
            </p>
            {/* 20 px, pas 36 : le plus gros texte d'un écran de travail reste
                proche du corps, et la hiérarchie passe par la graisse. */}
            <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.01em]">
              {t("dashboard.welcome", { name: getFirstName(name) })}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
          </div>
          {materials.length > 0 && (
            <CsvExportButton
              materials={materials}
              sites={sites}
              rooms={rooms}
              lang={lang}
            />
          )}
        </section>

        {/* ── LA RANGÉE DE MESURES ────────────────────────────────────
            Quatre cartes à pastille colorée sont devenues quatre colonnes
            séparées par un filet. La carte encadrait chaque chiffre, donc
            aucun ne ressortait ; le filet sépare sans peser. Stripe nomme ce
            trait « keyline » et en fait son moyen de délimitation de premier
            rang, la carte n'arrivant qu'ensuite.

            Le BUDGET entre dans cette rangée, à la place des « utilisateurs
            de l'application ». Le lecteur ouvre cette page pour savoir ce qui
            va lui coûter de l'argent ce trimestre ; le nombre de comptes ne
            répond pas à cette question, et se lit dans le menu Utilisateurs. */}
        <section className="grid grid-cols-2 gap-x-6 gap-y-6 rounded-xl border border-glass-border px-5 py-4 md:grid-cols-4 md:divide-x md:divide-glass-border">
          <Mesure
            etiquette={t("dashboard.kpi_materials")}
            valeur={materials.length.toString()}
            detail={`${sites.length} sites · ${rooms.length} salles`}
          />
          <div className="md:pl-6">
            <Mesure
              etiquette={t("dashboard.kpi_score")}
              valeur={`${avgScore}`}
              detail={
                avgScore >= 70 ? t("dashboard.kpi_score_hint_good")
                : avgScore >= 40 ? t("dashboard.kpi_score_hint_warn")
                : t("dashboard.kpi_score_hint_bad")
              }
              ton={tonDuScore(avgScore)}
            >
              {/* Le seuil de 70 est matérialisé par un trait : on voit si le
                  parc le franchit, ce qu'un « 81/100 » ne disait pas. */}
              <BarreRepere valeur={avgScore} seuil={70} className="mt-0.5 mb-1" />
            </Mesure>
          </div>
          <div className="md:pl-6">
            <Mesure
              etiquette={t("dashboard.kpi_to_replace")}
              valeur={distribution.critical.toString()}
              detail={`${distribution.warning} ${t("obsolescence.level_warning").toLowerCase()}`}
              ton={distribution.critical > 0 ? "critique" : "neutre"}
            />
          </div>
          <div className="md:pl-6">
            <Mesure
              etiquette={t("dashboard.budget_title")}
              valeur={fmtAriary(budget.totalEstimated)}
              detail={t("dashboard.budget_hint", { n: budget.totalCritical })}
            />
          </div>
        </section>

        {/* ── SANTÉ DU PARC ───────────────────────────────────────────────
            Le camembert occupait les deux tiers d'une rangée pour trois
            nombres. Une barre empilée les donne dans la hauteur d'un texte,
            et permet en prime de comparer deux lignes entre elles, ce
            qu'aucune juxtaposition de camemberts ne permet. */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-semibold">{t("dashboard.health_title")}</h3>
            <p className="text-xs text-muted-foreground tabular-nums">
              {distribution.total} {t("dashboard.kpi_materials").toLowerCase()}
            </p>
          </div>
          <BarreEmpilee
            hauteur="h-2.5"
            segments={[
              { valeur: distribution.ok, ton: "bon", libelle: t("obsolescence.level_ok") },
              { valeur: distribution.warning, ton: "vigilance", libelle: t("obsolescence.level_warning") },
              { valeur: distribution.critical, ton: "critique", libelle: t("obsolescence.level_critical") },
            ]}
          />
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {[
              { n: distribution.ok, ton: "bon" as const, l: t("obsolescence.level_ok") },
              { n: distribution.warning, ton: "vigilance" as const, l: t("obsolescence.level_warning") },
              { n: distribution.critical, ton: "critique" as const, l: t("obsolescence.level_critical") },
            ].map((x) => (
              <Pastille key={x.l} ton={x.ton}>
                {x.l}
                <span className="ml-1.5 font-medium tabular-nums text-foreground">{x.n}</span>
                <span className="ml-1 tabular-nums">
                  {distribution.total > 0 ? `${Math.round((x.n / distribution.total) * 100)} %` : ""}
                </span>
              </Pastille>
            ))}
          </div>
        </section>

        {/* Le détail du budget garde sa carte, et c'est le seul bloc de la
            page qui en garde une : son contenu se lit ligne à ligne et se
            discute en réunion. Encadrer devient l'exception, donc retrouve
            son sens. */}
        <BudgetCard budget={budget} lang={lang} />

        {/* Répartition : par site et par catégorie, même question, deux échelles. */}
        {/* Deux colonnes de largeur égale : « par site » et « par catégorie »
            répondent à la même question à deux échelles. Les animations
            échelonnées ont sauté : sur les postes du centre, chaque section
            qui glisse coûte une saccade, et rien ne s'apprend d'une entrée en
            scène. */}
        <section className="grid gap-6 lg:grid-cols-2">
          <SiteBreakdown sites={siteStats} lang={lang} />
          <TypeBreakdown types={typeStats} lang={lang} />
        </section>

        {/* Âge du parc + Salles à risque */}
        <section className="grid gap-6 lg:grid-cols-2">
          <AgeHistogram buckets={ageBuckets} lang={lang} />
          <RoomHeatmap rooms={roomStats} lang={lang} />
        </section>

        {/* Top à remplacer */}
        {worstMaterials.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {t("dashboard.priorities_eyebrow")}
                </p>
                <h3 className="mt-1 font-display text-2xl font-semibold flex items-center gap-2">
                  <TrendingDown className="size-5 text-primary" />
                  {t("dashboard.priorities_title")}
                </h3>
              </div>
              <Link href="/materials?sort=score">
                <GlassButton variant="glass" size="sm">
                  {t("common.view_all")}
                  <ArrowRight className="size-3.5" />
                </GlassButton>
              </Link>
            </div>

            <GlassCard className="p-2">
              <div className="divide-y divide-glass-border">
                {worstMaterials.map(({ material, score, level }) => (
                  <Link
                    key={material.id}
                    href={`/materials/${material.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-white/5 rounded-2xl transition-colors group"
                  >
                    <div className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary shrink-0">
                      <MaterialTypeIcon type={material.type} className="size-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{material.designation || material.ref}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{material.ref}</p>
                    </div>
                    <ObsolescenceBadge level={level} score={score} lang={lang} size="sm" showScore />
                    <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all hidden md:block" />
                  </Link>
                ))}
              </div>
            </GlassCard>
          </section>
        )}

        {/* Les trois cartes « Sites & salles », « Parc complet » et
            « Mouvements » ont été retirées : elles reprenaient mot pour mot
            trois entrées de la barre latérale, toujours visible à gauche. Une
            navigation répétée n'aide pas, elle allonge la page et fait douter
            de savoir où l'on est. */}
      </main>
    </>
  );
}
