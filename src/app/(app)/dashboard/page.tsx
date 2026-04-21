import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Cpu, Building2, Users as UsersIcon, AlertTriangle,
  ArrowRight, TrendingDown, Activity,
} from "lucide-react";

import { AppTopbar } from "@/components/layout/app-topbar";
import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { ObsolescenceBadge } from "@/components/materials/obsolescence-badge";
import { MaterialTypeIcon } from "@/components/materials/type-icon";
import { ObsolescenceDonut } from "@/components/dashboard/obsolescence-donut";
import { AgeHistogram } from "@/components/dashboard/age-histogram";
import { SiteBreakdown } from "@/components/dashboard/site-breakdown";
import { TypeBreakdown } from "@/components/dashboard/type-breakdown";
import { BudgetCard } from "@/components/dashboard/budget-card";
import { RoomHeatmap } from "@/components/dashboard/room-heatmap";
import { CsvExportButton } from "@/components/dashboard/csv-export-button";
import { ROLE_LABELS, type Material, type Site, type Room, type AppUser } from "@/types";
import { listMaterials } from "@/lib/sheets/materials";
import { listSites, listRooms } from "@/lib/sheets/sites";
import { listUsers } from "@/lib/sheets/users";
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

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { name, role, lang } = session.user;
  const t = getT(lang);

  const [materialsRes, sitesRes, roomsRes, usersRes] = await Promise.all([
    safe<Material[]>(() => listMaterials(), []),
    safe<Site[]>(() => listSites(), []),
    safe<Room[]>(() => listRooms(), []),
    safe<AppUser[]>(() => listUsers(), []),
  ]);

  const materials = materialsRes.data;
  const sites = sitesRes.data;
  const rooms = roomsRes.data;
  const usersCount = usersRes.data.length;

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
      <AppTopbar title={t("topbar.dashboard")} />

      <main className="flex-1 p-4 md:p-10 space-y-8 md:space-y-10">
        {/* Hero greeting + export */}
        <section className="flex items-end justify-between gap-4 flex-wrap animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {ROLE_LABELS[role][lang]}
            </p>
            <h2 className="mt-2 font-display text-3xl md:text-4xl font-semibold tracking-tight">
              {t("dashboard.welcome", { name: name?.split(" ")[0] ?? "" })}
            </h2>
            <p className="mt-2 text-muted-foreground max-w-2xl">
              {t("dashboard.subtitle")}
            </p>
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

        {/* KPIs */}
        <section
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 animate-in fade-in slide-in-from-bottom-2 duration-500"
          style={{ animationDelay: "80ms", animationFillMode: "backwards" }}
        >
          <KPI
            icon={<Cpu className="size-5" />}
            label={t("dashboard.kpi_materials")}
            value={materials.length.toString()}
            hint={`${sites.length} · ${rooms.length}`}
            accent="primary"
          />
          <KPI
            icon={<Activity className="size-5" />}
            label={t("dashboard.kpi_score")}
            value={`${avgScore}/100`}
            hint={
              avgScore >= 70 ? t("dashboard.kpi_score_hint_good") :
              avgScore >= 40 ? t("dashboard.kpi_score_hint_warn") : t("dashboard.kpi_score_hint_bad")
            }
            accent={avgScore >= 70 ? "success" : avgScore >= 40 ? "warning" : "primary"}
          />
          <KPI
            icon={<AlertTriangle className="size-5" />}
            label={t("dashboard.kpi_to_replace")}
            value={distribution.critical.toString()}
            hint={`${distribution.warning} ${t("obsolescence.level_warning").toLowerCase()}`}
            accent="primary"
          />
          <KPI
            icon={<UsersIcon className="size-5" />}
            label={t("dashboard.kpi_users")}
            value={usersCount.toString()}
            hint={`${sites.length} centres`}
            accent="cyan"
          />
        </section>

        {/* Analytics — Santé du parc */}
        <section
          className="grid gap-4 lg:grid-cols-3 animate-in fade-in slide-in-from-bottom-2 duration-500"
          style={{ animationDelay: "160ms", animationFillMode: "backwards" }}
        >
          <div className="lg:col-span-2">
            <ObsolescenceDonut distribution={distribution} lang={lang} />
          </div>
          <BudgetCard budget={budget} />
        </section>

        {/* Analytics — Répartition */}
        <section
          className="grid gap-4 lg:grid-cols-2 animate-in fade-in slide-in-from-bottom-2 duration-500"
          style={{ animationDelay: "240ms", animationFillMode: "backwards" }}
        >
          <SiteBreakdown sites={siteStats} />
          <TypeBreakdown types={typeStats} />
        </section>

        {/* Âge du parc + Salles à risque */}
        <section
          className="grid gap-4 lg:grid-cols-2 animate-in fade-in slide-in-from-bottom-2 duration-500"
          style={{ animationDelay: "320ms", animationFillMode: "backwards" }}
        >
          <AgeHistogram buckets={ageBuckets} />
          <RoomHeatmap rooms={roomStats} />
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

        {/* Quick links */}
        <section className="grid gap-4 md:grid-cols-3">
          <Link href="/sites">
            <GlassCard interactive className="p-6 group h-full">
              <Building2 className="size-8 text-accent mb-3" />
              <h3 className="font-display font-semibold">{t("dashboard.quick_sites")}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t("dashboard.quick_sites_desc")}</p>
            </GlassCard>
          </Link>
          <Link href="/materials">
            <GlassCard interactive className="p-6 group h-full">
              <Cpu className="size-8 text-primary mb-3" />
              <h3 className="font-display font-semibold">{t("dashboard.quick_materials")}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t("dashboard.quick_materials_desc")}</p>
            </GlassCard>
          </Link>
          <Link href="/movements">
            <GlassCard interactive className="p-6 group h-full">
              <ArrowRight className="size-8 text-[oklch(0.75_0.18_150)] mb-3" />
              <h3 className="font-display font-semibold">{t("dashboard.quick_movements")}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t("dashboard.quick_movements_desc")}</p>
            </GlassCard>
          </Link>
        </section>
      </main>
    </>
  );
}

function KPI({
  icon, label, value, hint, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  accent: "primary" | "cyan" | "success" | "warning";
}) {
  const accentBg =
    accent === "primary" ? "bg-primary/15 text-primary" :
    accent === "cyan" ? "bg-accent/15 text-accent" :
    accent === "success" ? "bg-[oklch(0.75_0.18_150_/_0.15)] text-[oklch(0.75_0.18_150)]" :
    "bg-[oklch(0.82_0.16_85_/_0.15)] text-[oklch(0.82_0.16_85)]";

  return (
    <GlassCard className="p-6">
      <div className={`inline-flex size-10 items-center justify-center rounded-xl ${accentBg}`}>
        {icon}
      </div>
      <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </GlassCard>
  );
}
