import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle, FileDown } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { GlassCard } from "@/components/glass/glass-card";
import { etatMensuel, type EtatAgentMois, nomAffiche } from "@/lib/pointage/data";
import { versHeures } from "@/lib/pointage/calcul";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "États mensuels (Pointage)" };

export default async function EtatsPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:pointage")) redirect("/apps");
  const t = getT(session.user.lang);

  const sp = await searchParams;
  const now = new Date(Date.now() + 3 * 3600 * 1000);
  const moisDefaut = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const mois = /^\d{4}-\d{2}$/.test(sp.mois ?? "") ? sp.mois! : moisDefaut;
  const [a, m] = mois.split("-").map(Number);
  const du = `${mois}-01`;
  const au = `${mois}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;

  const res = await safe<EtatAgentMois[]>(() => etatMensuel(du, au), []);
  const etats = res.data
    .filter((e) => e.total.minutesTravaillees > 0 || e.total.nbAnomalies > 0)
    .sort((a2, b2) => b2.total.minutesTravaillees - a2.total.minutesTravaillees);

  const totalHeures = etats.reduce((s, e) => s + e.total.minutesTravaillees, 0);
  const totalAnomalies = etats.reduce((s, e) => s + e.total.nbAnomalies, 0);

  return (
    <main id="main-content" className="mx-auto max-w-6xl flex-1 p-4 md:p-10 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/pointage"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("pointage.title")}
          </Link>
          <h1 className="mt-3 font-display text-xl font-semibold tracking-tight">
            {t("pointage.nav_etats")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {du} → {au} · {etats.length} agents · {versHeures(totalHeures)} au total
          </p>
        </div>
        {/* Navigation de mois sans JS : de simples liens. */}
        <form className="flex items-end gap-2">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
              {t("pointage.periode")}
            </span>
            <input
              type="month"
              name="mois"
              defaultValue={mois}
              className="rounded-xl glass border px-3 h-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl border border-accent/40 bg-accent/12 px-4 h-10 text-sm font-medium text-accent hover:bg-accent/20 transition-colors"
          >
            Afficher
          </button>
        </form>
      </div>

      {/* Édition à la demande, pour la direction et le service RH. */}
      <a
        href={`/api/pointage/rapport-planning?du=${du}&au=${au}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/12 px-4 py-2.5 text-sm font-medium text-accent hover:bg-accent/20 transition-colors"
      >
        <FileDown className="size-4" aria-hidden="true" />
        État planifié / réalisé (PDF)
      </a>

      {totalAnomalies > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/[0.06] px-4 py-3 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {totalAnomalies} anomalie(s) de pointage sur la période (sortie non badgée,
            passage manquant). Les heures correspondantes ne sont pas comptées tant
            qu&apos;une correction motivée n&apos;a pas été saisie.
          </span>
        </div>
      )}

      <GlassCard className="overflow-x-auto p-0">
        {etats.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {t("pointage.aucune_donnee")}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-glass-border text-left">
                <Th>{t("pointage.col_agent")}</Th>
                <Th>{t("pointage.col_site")}</Th>
                <Th className="text-right">{t("pointage.col_jours")}</Th>
                <Th className="text-right">{t("pointage.col_heures")}</Th>
                <Th className="text-right">{t("pointage.col_retard")}</Th>
                <Th className="text-right">{t("pointage.col_hs")}</Th>
                <Th className="text-right">{t("pointage.col_anomalies")}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border">
              {etats.map((e) => (
                <tr key={e.agent.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/pointage/agents/${e.agent.id}?mois=${mois}`} className="font-medium hover:text-accent transition-colors">{nomAffiche(e.agent)}</Link>
                    {e.agent.statut === "prestataire" && (
                      <span className="ml-2 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                        {t("pointage.statut_prestataire")}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{e.agent.site}</td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums">
                    {e.total.joursTravailles}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums font-semibold">
                    {versHeures(e.total.minutesTravaillees)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-muted-foreground">
                    {e.total.minutesRetard > 0 ? versHeures(e.total.minutesRetard) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums">
                    {e.total.minutesSupProposees > 0 ? versHeures(e.total.minutesSupProposees) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {e.total.nbAnomalies > 0 ? (
                      <span className="font-mono tabular-nums text-warning">{e.total.nbAnomalies}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>

      <p className="text-[11px] text-muted-foreground">
        Les heures supplémentaires affichées sont <strong>proposées</strong> par le calcul
        (au-delà de l&apos;horaire théorique) : elles ne sont dues qu&apos;une fois accordées par
        le responsable. Pour les prestataires, l&apos;heure d&apos;entrée est plafonnée à 7:50 / 13:50
        conformément à la règle en vigueur au centre.
      </p>
    </main>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-5 py-2.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
