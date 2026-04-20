import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Cpu, Building2, Users as UsersIcon, AlertTriangle } from "lucide-react";

import { AppTopbar } from "@/components/layout/app-topbar";
import { GlassCard } from "@/components/glass/glass-card";
import { ROLE_LABELS } from "@/types";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { name, role, lang } = session.user;

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
            Voici une vue d&apos;ensemble du parc informatique. Les données détaillées arrivent
            en Phase 3 — pour l&apos;instant, vous pouvez naviguer dans les sections du menu.
          </p>
        </section>

        {/* KPIs (placeholder) */}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KPI
            icon={<Cpu className="size-5" />}
            label="Matériels"
            value="—"
            hint="Phase 3"
            accent="primary"
          />
          <KPI
            icon={<Building2 className="size-5" />}
            label="Salles"
            value="15"
            hint="REX + MIARAKA"
            accent="cyan"
          />
          <KPI
            icon={<UsersIcon className="size-5" />}
            label="Utilisateurs app"
            value="—"
            hint="Phase 3"
            accent="success"
          />
          <KPI
            icon={<AlertTriangle className="size-5" />}
            label="À remplacer"
            value="—"
            hint="Score < 40"
            accent="warning"
          />
        </section>

        {/* Roadmap status */}
        <section>
          <GlassCard className="p-8">
            <h3 className="font-display text-xl font-semibold">Statut du déploiement</h3>
            <ol className="mt-6 space-y-3 text-sm">
              <Step done label="Phase 0 · Setup + design liquid glass + Vercel" />
              <Step done label="Phase 1 · Google Cloud + Sheet (10 onglets)" />
              <Step active label="Phase 2 · Authentification 4 rôles + middleware" />
              <Step label="Phase 3 · CRUD matériels (sites → salles → fiche)" />
              <Step label="Phase 4 · Chiffrement AES MDP + audit log" />
              <Step label="Phase 5 · Dashboard KPIs + score d'obsolescence" />
              <Step label="Phase 6 · Historique des mouvements" />
              <Step label="Phase 7 · Corbeille + admin utilisateurs" />
              <Step label="Phase 8 · i18n complet FR/IT" />
              <Step label="Phase 9 · Polish + responsive mobile" />
              <Step label="Phase 10 · Monitoring + custom domain" />
            </ol>
          </GlassCard>
        </section>
      </main>
    </>
  );
}

function KPI({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  accent: "primary" | "cyan" | "success" | "warning";
}) {
  const accentBg =
    accent === "primary"
      ? "bg-primary/15 text-primary"
      : accent === "cyan"
        ? "bg-accent/15 text-accent"
        : accent === "success"
          ? "bg-[oklch(0.75_0.18_150_/_0.15)] text-[oklch(0.75_0.18_150)]"
          : "bg-[oklch(0.82_0.16_85_/_0.15)] text-[oklch(0.82_0.16_85)]";

  return (
    <GlassCard className="p-6">
      <div className={`inline-flex size-10 items-center justify-center rounded-xl ${accentBg}`}>
        {icon}
      </div>
      <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </GlassCard>
  );
}

function Step({
  done,
  active,
  label,
}: {
  done?: boolean;
  active?: boolean;
  label: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold ${
          done
            ? "bg-[oklch(0.75_0.18_150)] text-black"
            : active
              ? "bg-primary text-primary-foreground"
              : "bg-white/5 border border-glass-border text-muted-foreground"
        }`}
      >
        {done ? "✓" : active ? "•" : ""}
      </span>
      <span
        className={
          done
            ? "text-foreground"
            : active
              ? "text-foreground font-medium"
              : "text-muted-foreground"
        }
      >
        {label}
      </span>
    </li>
  );
}
