import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserCheck, UserMinus, Users, Building2 } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { GlassCard } from "@/components/glass/glass-card";
import { PanneBanner } from "@/components/layout/panne-banner";
import { presenceDuJour, type PresenceAgent, type Agent } from "@/lib/pointage/data";

import { BoutonCollecte } from "./bouton-collecte";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pointage" };

/** Jour courant à Antananarivo (UTC+3), indépendant du fuseau du serveur. */
function aujourdhuiMada(): string {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function PointagePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:pointage")) redirect("/apps");
  const t = getT(session.user.lang);
  const jour = aujourdhuiMada();

  const res = await safe<{ presents: PresenceAgent[]; absents: Agent[]; parSite: Record<string, number> }>(
    () => presenceDuJour(jour),
    { presents: [], absents: [], parSite: {} },
  );

  const { presents, absents, parSite } = res.data;
  const effectif = presents.length + absents.length;
  const dateLisible = new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

  return (
    <main id="main-content" className="mx-auto max-w-6xl flex-1 p-4 md:p-10 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {dateLisible}
        </p>
        <h1 className="mt-1 font-display text-3xl md:text-4xl font-semibold tracking-tight">
          {t("pointage.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("pointage.subtitle")}</p>
      </div>

      {!res.ok ? (
        <PanneBanner
          titre="Données de pointage indisponibles"
          consigne="La base ne répond pas. Les présences affichées seraient fausses : ne tirez aucune conclusion de cet écran tant qu'il n'est pas rétabli."
          detail={res.error}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={<UserCheck className="size-5" />} label={t("pointage.presents")} valeur={String(presents.length)} accent />
            <Kpi icon={<UserMinus className="size-5" />} label={t("pointage.absents")} valeur={String(absents.length)} />
            <Kpi icon={<Users className="size-5" />} label={t("pointage.effectif")} valeur={String(effectif)} />
            <Kpi
              icon={<Building2 className="size-5" />}
              label="Par site"
              valeur={Object.entries(parSite).map(([s, n]) => `${s} ${n}`).join(" · ") || "—"}
              petit
            />
          </div>

          {/* Collecte directe : réservée à qui gère le pointage. Un bouton
              par centre — chaque pointeuse a sa propre base de numérotation,
              et l'agent doit savoir laquelle il interroge. */}
          {can(session.user.role, "pointage:gerer") && (
            <div className="grid gap-4 sm:grid-cols-2">
              <BoutonCollecte site="REX" />
              <BoutonCollecte site="MIARAKA" />
            </div>
          )}

          <GlassCard className="overflow-hidden p-0">
            <div className="border-b border-glass-border px-5 py-3">
              <h2 className="font-display text-lg font-semibold">{t("pointage.presents")}</h2>
            </div>
            {presents.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                {t("pointage.aucun_present")}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-glass-border text-left">
                    <Th>{t("pointage.col_agent")}</Th>
                    <Th>{t("pointage.col_site")}</Th>
                    <Th className="text-right">{t("pointage.dernier_pointage")}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-glass-border">
                  {presents
                    .sort((a, b) => a.agent.nom.localeCompare(b.agent.nom) || a.agent.prenom.localeCompare(b.agent.prenom))
                    .map((p) => (
                      <tr key={p.agent.id}>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-2">
                            <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
                            <span className="font-medium">
                              {p.agent.prenom} {p.agent.nom}
                            </span>
                            {p.agent.poste ? (
                              <span className="text-[11px] text-muted-foreground">{p.agent.poste}</span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{p.site}</td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">{p.dernierPointage}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </GlassCard>

          <p className="text-[11px] text-muted-foreground">
            Un agent est considéré présent lorsqu&apos;il a badgé un nombre impair de fois
            aujourd&apos;hui (entré sans être ressorti). Les données proviennent des pointeuses
            des centres REX et MIARAKA.
          </p>
        </>
      )}
    </main>
  );
}

function Kpi({
  icon, label, valeur, accent, petit,
}: {
  icon: React.ReactNode; label: string; valeur: string; accent?: boolean; petit?: boolean;
}) {
  return (
    <GlassCard className="p-5">
      <div className={accent ? "text-accent" : "text-muted-foreground"}>{icon}</div>
      <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display font-semibold tracking-tight ${petit ? "text-base" : "text-3xl"} ${accent ? "text-accent" : ""}`}>
        {valeur}
      </p>
    </GlassCard>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-5 py-2.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium ${className ?? ""}`}>
      {children}
    </th>
  );
}
