import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle, Clock, CalendarDays, Sunrise, Sunset } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { GlassCard } from "@/components/glass/glass-card";
import { BadgesAgent } from "@/components/pointage/badge-site";
import { etatMensuel, nomAffiche, type EtatAgentMois } from "@/lib/pointage/data";
import { planifiePourAgents } from "@/lib/planning/data";
import { versHeures } from "@/lib/pointage/calcul";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fiche agent (Pointage)" };

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const COURT = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

/**
 * Fiche individuelle : emploi du temps de la période, semaine par semaine,
 * avec le prévu, le réalisé et les anomalies de chaque journée.
 *
 * Les anomalies n'étaient jusqu'ici visibles que globalement, sur l'écran des
 * corrections. Or elles se comprennent au niveau de la personne : « trois
 * sorties non badgées ce mois-ci » se lit dans son emploi du temps, pas dans
 * une liste de 155 lignes tous agents confondus.
 */
export default async function FicheAgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mois?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:pointage")) redirect("/apps");

  const { id } = await params;
  const sp = await searchParams;
  const now = new Date(Date.now() + 3 * 3600 * 1000);
  const moisDefaut = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const mois = /^\d{4}-\d{2}$/.test(sp.mois ?? "") ? sp.mois! : moisDefaut;
  const [an, m] = mois.split("-").map(Number);
  const du = `${mois}-01`;
  const au = `${mois}-${String(new Date(an, m, 0).getDate()).padStart(2, "0")}`;

  const [etatsRes, planRes] = await Promise.all([
    safe<EtatAgentMois[]>(() => etatMensuel(du, au), []),
    safe(() => planifiePourAgents(du, au), new Map()),
  ]);
  const etat = etatsRes.data.find((e) => e.agent.id === id);
  if (!etat) notFound();

  const planAgent = planRes.data.get(id);
  const nom = nomAffiche(etat.agent);

  // Regroupement par semaine ISO, pour une lecture calendaire.
  const semaines: Array<{ debut: string; jours: typeof etat.journees }> = [];
  for (const j of etat.journees) {
    const d = new Date(`${j.jour}T12:00:00Z`);
    const lundi = new Date(d);
    lundi.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const cle = lundi.toISOString().slice(0, 10);
    const s = semaines.find((x) => x.debut === cle);
    if (s) s.jours.push(j);
    else semaines.push({ debut: cle, jours: [j] });
  }

  const anomalies = etat.journees.filter((j) => j.anomalies.length > 0 && !j.ajuste);
  const minutesPlanifiees = planAgent
    ? [...planAgent.values()].reduce((s, x) => s + x.minutes, 0)
    : 0;

  return (
    <main id="main-content" className="mx-auto max-w-5xl flex-1 p-4 md:p-10 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/pointage/agents"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Personnel
          </Link>
          <h1 className="mt-3 font-display text-xl font-semibold tracking-tight">{nom}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <BadgesAgent site={etat.agent.site} statut={etat.agent.statut} />
            {etat.agent.poste && (
              <span className="text-sm text-muted-foreground">{etat.agent.poste}</span>
            )}
          </div>
        </div>
        <form className="flex items-end gap-2">
          <label className="block">
            <span className="mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Période
            </span>
            <input
              type="month"
              name="mois"
              defaultValue={mois}
              className="h-10 rounded-xl glass border px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-xl border border-accent/40 bg-accent/12 px-4 text-sm font-medium text-accent hover:bg-accent/20 transition-colors"
          >
            Afficher
          </button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Clock className="size-5" />} label="Heures réalisées" valeur={versHeures(etat.total.minutesTravaillees)} accent />
        <Kpi icon={<CalendarDays className="size-5" />} label="Heures planifiées" valeur={minutesPlanifiees > 0 ? versHeures(minutesPlanifiees) : "—"} />
        <Kpi icon={<Sunrise className="size-5" />} label="Jours travaillés" valeur={String(etat.total.joursTravailles)} />
        <Kpi
          icon={<AlertTriangle className="size-5" />}
          label="Anomalies"
          valeur={String(anomalies.length)}
          alerte={anomalies.length > 0}
        />
      </div>

      {anomalies.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/[0.06] px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-warning">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {anomalies.length} journée(s) à corriger
          </p>
          <ul className="mt-2 space-y-1 text-xs text-warning/90">
            {anomalies.slice(0, 8).map((j) => (
              <li key={j.jour}>
                <span className="font-mono">{j.jour}</span> : {j.anomalies.join(" · ")}
              </li>
            ))}
          </ul>
          {can(session.user.role, "pointage:corriger") && (
            <Link
              href={`/pointage/corrections?mois=${mois}`}
              className="mt-2 inline-block text-xs font-medium text-warning underline underline-offset-2"
            >
              Corriger ces journées →
            </Link>
          )}
        </div>
      )}

      {/* Emploi du temps, semaine par semaine. */}
      <div className="space-y-4">
        {semaines.map((sem) => {
          const total = sem.jours.reduce((s, j) => s + j.minutesTravaillees, 0);
          return (
            <GlassCard key={sem.debut} className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-glass-border px-5 py-2.5">
                <h2 className="font-display text-sm font-semibold">
                  Semaine du {sem.debut.slice(8, 10)}/{sem.debut.slice(5, 7)}
                </h2>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {versHeures(total)}
                </span>
              </div>
              <div className="divide-y divide-glass-border">
                {sem.jours.map((j) => {
                  const d = new Date(`${j.jour}T12:00:00Z`);
                  const prevu = planAgent?.get(j.jour);
                  const matin = j.plages[0];
                  const aprem = j.plages[1];
                  return (
                    <div
                      key={j.jour}
                      className={`grid grid-cols-[5.5rem_1fr_1fr_auto] items-center gap-3 px-5 py-2 text-sm ${
                        !j.jourOuvre ? "bg-black/[0.03] dark:bg-white/[0.03]" : ""
                      }`}
                    >
                      <div>
                        <span className="block text-xs capitalize text-muted-foreground">
                          {COURT[d.getUTCDay()]} {j.jour.slice(8, 10)}
                        </span>
                        {prevu && prevu.minutes > 0 && (
                          <span className="block font-mono text-[10px] text-muted-foreground">
                            prévu {versHeures(prevu.minutes)}
                          </span>
                        )}
                      </div>
                      <Demi icone={<Sunrise className="size-3" />} label="Matin" plage={matin} />
                      <Demi icone={<Sunset className="size-3" />} label="Après-midi" plage={aprem} />
                      <div className="text-right">
                        <span className="font-mono text-sm tabular-nums font-medium">
                          {j.minutesTravaillees > 0 ? versHeures(j.minutesTravaillees) : "—"}
                        </span>
                        {j.anomalies.length > 0 && !j.ajuste && (
                          <span
                            className="ml-1.5 inline-block text-warning"
                            title={j.anomalies.join(" · ")}
                          >
                            <AlertTriangle className="inline size-3.5" aria-hidden="true" />
                            <span className="sr-only">{j.anomalies.join(" · ")}</span>
                          </span>
                        )}
                        {j.typeAbsence && (
                          <span className="ml-1.5 rounded-full border border-glass-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {j.typeAbsence}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Les journées grisées ne sont pas ouvrées selon l&apos;horaire de l&apos;agent. Le triangle
        signale une anomalie de badgeage : les heures correspondantes ne sont pas comptées tant
        qu&apos;une correction motivée n&apos;a pas été saisie.
      </p>
    </main>
  );
}

/** Une demi-journée : plage badgée, ou tiret si rien. */
function Demi({
  icone,
  label,
  plage,
}: {
  icone: React.ReactNode;
  label: string;
  plage?: { debut: string; fin: string | null };
}) {
  if (!plage) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60">
        {icone}
        <span className="sr-only">{label} : </span>—
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums">
      <span className="text-muted-foreground">{icone}</span>
      <span className="sr-only">{label} : </span>
      {plage.debut}
      <span className="text-muted-foreground">→</span>
      {plage.fin ?? <span className="text-warning">?</span>}
    </span>
  );
}

function Kpi({
  icon, label, valeur, accent, alerte,
}: {
  icon: React.ReactNode; label: string; valeur: string; accent?: boolean; alerte?: boolean;
}) {
  return (
    <GlassCard className="p-5">
      <div className={alerte ? "text-warning" : accent ? "text-accent" : "text-muted-foreground"}>{icon}</div>
      <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-3xl font-semibold tracking-tight ${alerte ? "text-warning" : accent ? "text-accent" : ""}`}>
        {valeur}
      </p>
    </GlassCard>
  );
}
