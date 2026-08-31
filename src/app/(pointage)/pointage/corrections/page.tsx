import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, History, ShieldCheck } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { GlassCard } from "@/components/glass/glass-card";
import { etatMensuel, type EtatAgentMois, nomAffiche } from "@/lib/pointage/data";
import { versHeures } from "@/lib/pointage/calcul";

import { CorrectionLigne, BoutonHeuresSup, type AnomalieLigne } from "./correction-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Corrections (Pointage)" };

export default async function CorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "pointage:corriger")) redirect("/pointage");
  /* Accorder des heures supplémentaires engage la paie et reste à l'admin.
     La section demeure VISIBLE pour les autres : savoir quelles heures sont
     proposées fait partie du travail de la RH, même sans pouvoir les
     accorder. Seul le bouton disparaît, et on dit pourquoi. */
  const peutAccorder = can(session.user.role, "pointage:gerer");
  const t = getT(session.user.lang);

  const sp = await searchParams;
  const now = new Date(Date.now() + 3 * 3600 * 1000);
  const moisDefaut = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const mois = /^\d{4}-\d{2}$/.test(sp.mois ?? "") ? sp.mois! : moisDefaut;
  const [an, m] = mois.split("-").map(Number);
  const du = `${mois}-01`;
  const au = `${mois}-${String(new Date(an, m, 0).getDate()).padStart(2, "0")}`;

  const res = await safe<EtatAgentMois[]>(() => etatMensuel(du, au), []);

  // Journées à corriger : anomalie détectée et pas déjà ajustée.
  const anomalies: AnomalieLigne[] = [];
  const heuresSup: Array<{ agentId: string; agentNom: string; jour: string; minutes: number }> = [];
  for (const e of res.data) {
    const nom = nomAffiche(e.agent);
    for (const j of e.journees) {
      if (j.anomalies.length > 0 && !j.ajuste) {
        anomalies.push({
          agentId: e.agent.id,
          agentNom: nom,
          site: e.agent.site,
          jour: j.jour,
          anomalies: j.anomalies,
          plages: j.plages.map((p) => `${p.debut}–${p.fin ?? "?"}`).join("  "),
          heuresProposees: j.minutesSupProposees,
        });
      }
      if (j.minutesSupProposees >= 60) {
        heuresSup.push({ agentId: e.agent.id, agentNom: nom, jour: j.jour, minutes: j.minutesSupProposees });
      }
    }
  }
  anomalies.sort((a, b) => a.jour.localeCompare(b.jour) || a.agentNom.localeCompare(b.agentNom));
  heuresSup.sort((a, b) => b.minutes - a.minutes);

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
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
            Corrections & heures supplémentaires
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              {du} → {au} · {anomalies.length} journée(s) à corriger
            </span>
            <Link
              href="/pointage/corrections/historique"
              className="inline-flex items-center gap-1.5 text-accent transition-colors hover:underline"
            >
              <History className="size-3.5" aria-hidden="true" />
              Historique des corrections
            </Link>
          </p>
        </div>
        <form className="flex items-end gap-2">
          <label className="block">
            <span className="mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t("pointage.periode")}
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

      <div className="flex items-start gap-2 rounded-xl border border-glass-border bg-white/3 px-4 py-3 text-sm">
        <ShieldCheck className="size-4 shrink-0 mt-0.5 text-accent" aria-hidden="true" />
        <span className="text-muted-foreground">
          Les pointages enregistrés par les machines ne sont jamais modifiés. Chaque correction
          s&apos;ajoute par-dessus avec son motif, son auteur et sa date : la paie reste
          justifiable en cas de contestation. Tout ce qui a été corrigé se relit dans
          l&apos;historique.
        </span>
      </div>

      <GlassCard className="overflow-x-auto p-0">
        <div className="border-b border-glass-border px-5 py-3">
          <h2 className="font-display text-lg font-semibold">Journées à corriger</h2>
        </div>
        {anomalies.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Aucune anomalie sur la période : tous les pointages sont complets.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-glass-border text-left">
                <Th>Agent</Th>
                <Th>Jour</Th>
                <Th>Pointages</Th>
                <Th>Anomalie</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border">
              {anomalies.slice(0, 100).map((l) => (
                <CorrectionLigne key={`${l.agentId}-${l.jour}`} ligne={l} />
              ))}
            </tbody>
          </table>
        )}
        {anomalies.length > 100 && (
          <p className="border-t border-glass-border px-5 py-3 text-xs text-muted-foreground">
            {anomalies.length - 100} autres journées en anomalie ne sont pas affichées ici : traitez
            celles-ci puis rechargez.
          </p>
        )}
      </GlassCard>

      <GlassCard className="overflow-x-auto p-0">
        <div className="border-b border-glass-border px-5 py-3">
          <h2 className="font-display text-lg font-semibold">Heures supplémentaires proposées</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Au-delà de l&apos;horaire théorique, à partir d&apos;une heure. Elles ne sont dues
            qu&apos;une fois accordées.
          </p>
        </div>
        {heuresSup.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Aucune heure supplémentaire proposée sur la période.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-glass-border text-left">
                <Th>Agent</Th>
                <Th>Jour</Th>
                <Th className="text-right">Durée</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border">
              {heuresSup.slice(0, 50).map((h) => (
                <tr key={`${h.agentId}-${h.jour}`} className="hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3 font-medium">{h.agentNom}</td>
                  <td className="px-5 py-3 font-mono tabular-nums text-xs">{h.jour}</td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums">{versHeures(h.minutes)}</td>
                  <td className="px-5 py-3 text-right">
                    {peutAccorder ? (
                      <BoutonHeuresSup {...h} />
                    ) : (
                      <span className="text-xs text-muted-foreground">à accorder par la direction</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>
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
