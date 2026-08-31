import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { GlassCard } from "@/components/glass/glass-card";
import { listAgents, listHoraires, type Agent, type Horaire, nomAffiche } from "@/lib/pointage/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fiches du personnel (Pointage)" };

export default async function AgentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:pointage")) redirect("/apps");
  const t = getT(session.user.lang);

  const [agentsRes, horairesRes] = await Promise.all([
    safe<Agent[]>(() => listAgents(), []),
    safe<Horaire[]>(() => listHoraires(), []),
  ]);
  const agents = agentsRes.data.filter((a) => a.actif);
  const libelleHoraire = new Map(horairesRes.data.map((h) => [h.id, h.libelle]));

  const parSite = agents.reduce<Record<string, number>>((acc, a) => {
    acc[a.site] = (acc[a.site] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main id="main-content" className="mx-auto max-w-6xl flex-1 p-4 md:p-10 space-y-6">
      <div>
        <Link
          href="/pointage"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("pointage.title")}
        </Link>
        <h1 className="mt-3 font-display text-xl font-semibold tracking-tight">
          {t("pointage.nav_agents")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {agents.length} agents actifs ·{" "}
          {Object.entries(parSite).map(([s, n]) => `${s} ${n}`).join(" · ")}
        </p>
      </div>

      <GlassCard className="overflow-x-auto p-0">
        {agents.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {t("pointage.agents_vide")}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-glass-border text-left">
                <Th>{t("pointage.col_agent")}</Th>
                <Th>{t("pointage.col_site")}</Th>
                <Th>Statut</Th>
                <Th>Poste</Th>
                <Th>Horaire</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border">
              {agents.map((a) => (
                <tr key={a.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3">
                    <Link
                      href={`/pointage/agents/${a.id}`}
                      className="font-medium hover:text-accent transition-colors"
                    >
                      {nomAffiche(a)}
                    </Link>
                    <span className="block text-[11px] text-muted-foreground font-mono">{a.id}</span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{a.site}</td>
                  <td className="px-5 py-3">
                    <span
                      className={
                        a.statut === "prestataire"
                          ? "rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] text-accent"
                          : "text-muted-foreground text-xs"
                      }
                    >
                      {a.statut === "prestataire"
                        ? t("pointage.statut_prestataire")
                        : t("pointage.statut_salarie")}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{a.poste || "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">
                    {libelleHoraire.get(a.horaire_id) ?? a.horaire_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>

      <p className="text-[11px] text-muted-foreground">
        Cliquez sur un nom pour ouvrir sa fiche : emploi du temps de la semaine, heures
        prévues et réalisées, anomalies de badgeage.
      </p>
    </main>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-5 py-2.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
      {children}
    </th>
  );
}
