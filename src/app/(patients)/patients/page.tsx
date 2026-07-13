import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Users, Receipt, FileText } from "lucide-react";

import { auth } from "@/auth";
import { GlassCard } from "@/components/glass/glass-card";
import { statsPatients, type PatientsStats } from "@/lib/patients/supabase";
import { getT } from "@/lib/i18n";
import { getFirstName } from "@/lib/utils";

import { PatientsSearch } from "./patients-search";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Patients" };

export default async function PatientsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { name, lang } = session.user;
  const t = getT(lang);

  let stats: PatientsStats | null = null;
  try {
    stats = await statsPatients();
  } catch {
    stats = null;
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang === "it" ? "it-IT" : "fr-FR").format(n);

  return (
    <main id="main-content" className="mx-auto max-w-4xl flex-1 p-4 md:p-10 space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {t("patients.eyebrow")}
        </p>
        <h1 className="mt-1 font-display text-3xl md:text-4xl font-semibold tracking-tight">
          {t("patients.welcome", { name: getFirstName(name) })}
        </h1>
        <p className="mt-2 text-muted-foreground text-sm md:text-base">
          {t("patients.subtitle")}
        </p>
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <MiniStat
            icon={<Users className="size-5" />}
            label={t("patients.stat_visites")}
            value={fmt(stats.totalVisites)}
          />
          <MiniStat
            icon={<Receipt className="size-5" />}
            label={t("patients.stat_caisse")}
            value={fmt(stats.totalCaisse)}
          />
          <MiniStat
            icon={<FileText className="size-5" />}
            label={t("patients.stat_lettres")}
            value={fmt(stats.totalLettres)}
          />
        </div>
      )}

      <GlassCard className="p-6">
        <h2 className="font-display text-lg font-semibold mb-4">
          {t("patients.search_title")}
        </h2>
        <PatientsSearch lang={lang} />
      </GlassCard>
    </main>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <GlassCard className="p-5">
      <div className="inline-flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
        {icon}
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
        {value}
      </p>
    </GlassCard>
  );
}
