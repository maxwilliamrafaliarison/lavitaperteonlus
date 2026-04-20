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
import { ROLE_LABELS, type Material, type Site, type Room } from "@/types";
import { listMaterials } from "@/lib/sheets/materials";
import { listSites, listRooms } from "@/lib/sheets/sites";
import { listUsers } from "@/lib/sheets/users";
import { safe } from "@/lib/sheets/safe";
import { scoreObsolescence } from "@/lib/obsolescence";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { name, role, lang } = session.user;

  const [materialsRes, sitesRes, roomsRes, usersRes] = await Promise.all([
    safe<Material[]>(() => listMaterials(), []),
    safe<Site[]>(() => listSites(), []),
    safe<Room[]>(() => listRooms(), []),
    safe<{ length: number }>(() => listUsers(), { length: 0 }),
  ]);

  const materials = materialsRes.data;
  const sites = sitesRes.data;
  const rooms = roomsRes.data;
  const usersCount = Array.isArray(usersRes.data) ? usersRes.data.length : 0;

  // Score global = moyenne des scores
  const scores = materials.map((m) => scoreObsolescence(m));
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((s, x) => s + x.score, 0) / scores.length)
      : 0;
  const critical = scores.filter((s) => s.level === "critical").length;
  const warning = scores.filter((s) => s.level === "warning").length;

  // Top à remplacer (5 plus mauvais scores)
  const worstMaterials = materials
    .map((m) => ({ material: m, ...scoreObsolescence(m) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  return (
    <>
      <AppTopbar title="Tableau de bord" />

      <main className="flex-1 p-6 md:p-10 space-y-8">
        {/* Hero greeting */}
        <section>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {ROLE_LABELS[role][lang]}
          </p>
          <h2 className="mt-2 font-display text-3xl md:text-4xl font-semibold tracking-tight">
            Bienvenue, {name?.split(" ")[0] ?? "personnel"} 👋
          </h2>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Vue d&apos;ensemble du parc informatique La Vita Per Te.
          </p>
        </section>

        {/* KPIs */}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KPI
            icon={<Cpu className="size-5" />}
            label="Matériels"
            value={materials.length.toString()}
            hint={`${sites.length} site${sites.length > 1 ? "s" : ""} · ${rooms.length} salles`}
            accent="primary"
          />
          <KPI
            icon={<Activity className="size-5" />}
            label="Score parc moyen"
            value={`${avgScore}/100`}
            hint={
              avgScore >= 70 ? "Parc en bonne santé" :
              avgScore >= 40 ? "À surveiller" : "Action requise"
            }
            accent={avgScore >= 70 ? "success" : avgScore >= 40 ? "warning" : "primary"}
          />
          <KPI
            icon={<AlertTriangle className="size-5" />}
            label="À remplacer"
            value={critical.toString()}
            hint="Score < 40"
            accent="primary"
          />
          <KPI
            icon={<UsersIcon className="size-5" />}
            label="Utilisateurs app"
            value={usersCount.toString()}
            hint={`${warning} matériels à surveiller`}
            accent="cyan"
          />
        </section>

        {/* Worst materials */}
        {worstMaterials.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Décisions
                </p>
                <h3 className="mt-1 font-display text-2xl font-semibold flex items-center gap-2">
                  <TrendingDown className="size-5 text-primary" />
                  Priorités de remplacement
                </h3>
              </div>
              <Link href="/materials?sort=score">
                <GlassButton variant="glass" size="sm">
                  Voir tout
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
              <h3 className="font-display font-semibold">Sites & salles</h3>
              <p className="text-sm text-muted-foreground mt-1">Naviguer par centre puis par salle.</p>
            </GlassCard>
          </Link>
          <Link href="/materials">
            <GlassCard interactive className="p-6 group h-full">
              <Cpu className="size-8 text-primary mb-3" />
              <h3 className="font-display font-semibold">Parc complet</h3>
              <p className="text-sm text-muted-foreground mt-1">Liste détaillée avec recherche et filtres.</p>
            </GlassCard>
          </Link>
          <Link href="/movements">
            <GlassCard interactive className="p-6 group h-full">
              <ArrowRight className="size-8 text-[oklch(0.75_0.18_150)] mb-3" />
              <h3 className="font-display font-semibold">Mouvements</h3>
              <p className="text-sm text-muted-foreground mt-1">Historique des transferts (Phase 6).</p>
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
