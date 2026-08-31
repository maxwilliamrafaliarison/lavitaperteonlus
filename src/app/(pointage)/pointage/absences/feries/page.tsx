import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { GlassCard } from "@/components/glass/glass-card";
import { PanneBanner } from "@/components/layout/panne-banner";
import { listFeries, moduleAbsencesInstalle, type Ferie } from "@/lib/pointage/absences-data";
import { aujourdhui } from "@/lib/tz";

import { AjouterFerie, SupprimerFerie } from "./feries-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jours fériés (Pointage)" };

/* ============================================================
   JOURS FÉRIÉS
   ============================================================

   ── POURQUOI CETTE LISTE EST SAISIE ET NON CALCULÉE ──────────────────────
   Huit fêtes malgaches tombent à date fixe et se posent d'un clic. Les
   autres ne se codent pas : Pâques et la Pentecôte suivent le comput
   ecclésiastique, et les jours chômés décidés par le centre ne suivent rien
   du tout. Une règle qui ne couvre que la moitié des cas produirait un
   calendrier faux dont personne ne saurait dire où.

   ── CE QUE CETTE LISTE CHANGE ────────────────────────────────────────────
   Un jour férié tombant pendant un congé n'est pas décompté du solde. Sans
   cette liste, une semaine de congé traversée par le 26 juin coûterait à la
   personne un jour qu'elle ne doit pas.
   ============================================================ */

export default async function FeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "pointage:absences")) redirect("/pointage");
  const t = getT(session.user.lang);

  const sp = await searchParams;
  const anCourant = Number(aujourdhui().slice(0, 4));
  const demande = Number(sp.annee);
  const annee = Number.isFinite(demande) && demande >= 2020 && demande <= 2100 ? demande : anCourant;

  const res = await safe<{ feries: Ferie[]; installe: boolean }>(
    async () => {
      const [feries, installe] = await Promise.all([listFeries(), moduleAbsencesInstalle()]);
      return { feries, installe };
    },
    { feries: [], installe: true },
  );
  const delAnnee = res.data.feries
    .filter((f) => f.jour.startsWith(String(annee)))
    .sort((a, b) => a.jour.localeCompare(b.jour));

  return (
    <main id="main-content" className="mx-auto max-w-4xl flex-1 p-4 md:p-10 space-y-6">
      <div>
        <Link
          href="/pointage/absences"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("pointage.nav_absences")}
        </Link>
        <h1 className="mt-3 font-display text-xl font-semibold tracking-tight">
          {t("pointage.nav_feries")}
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Un jour férié tombant pendant un congé n&apos;est jamais retiré du solde : c&apos;est un
          jour chômé payé, pas un jour de congé consommé.
        </p>
      </div>

      {!res.ok ? (
        <PanneBanner
          titre="Jours fériés indisponibles"
          consigne="La base ne répond pas. Les congés seraient décomptés sans tenir compte des fériés : n'enregistrez rien tant que l'écran n'est pas rétabli."
          detail={res.error}
        />
      ) : !res.data.installe ? (
        <PanneBanner
          titre="Le module des congés n'est pas encore installé"
          consigne="La migration 023 doit être appliquée sur Supabase avant de pouvoir enregistrer des jours fériés."
          detail="Fichier à exécuter : supabase/migrations/023_pointage_absences.sql"
        />
      ) : (
        <>
          <nav className="flex flex-wrap gap-2" aria-label="Choisir l'année">
            {[anCourant - 1, anCourant, anCourant + 1].map((a) => (
              <Link
                key={a}
                href={`/pointage/absences/feries?annee=${a}`}
                aria-current={a === annee ? "page" : undefined}
                className={
                  a === annee
                    ? "rounded-xl border border-accent/40 bg-accent/12 px-3 py-1.5 text-sm text-accent"
                    : "rounded-xl border border-glass-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/5"
                }
              >
                {a}
              </Link>
            ))}
          </nav>

          <GlassCard className="p-5">
            <AjouterFerie annee={annee} dejaPris={delAnnee.filter((f) => !f.centre).map((f) => f.jour)} />
          </GlassCard>

          <GlassCard className="p-0">
            <div className="border-b border-glass-border px-5 py-3">
              <h2 className="font-display text-lg font-semibold">
                {delAnnee.length} jour{delAnnee.length > 1 ? "s" : ""} férié
                {delAnnee.length > 1 ? "s" : ""} en {annee}
              </h2>
            </div>
            {delAnnee.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                Aucun jour férié enregistré pour {annee}. Posez les fêtes fixes ci-dessus pour
                commencer.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-glass-border text-left">
                    <Th>Date</Th>
                    <Th>Jour férié</Th>
                    <Th>Centre</Th>
                    <Th className="text-right">Action</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-glass-border">
                  {delAnnee.map((f) => (
                    <tr key={`${f.jour}|${f.centre}`} className="transition-colors hover:bg-foreground/[0.02]">
                      <td className="px-5 py-3">
                        <span className="block text-sm">{enClair(f.jour)}</span>
                        <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
                          {f.jour}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium">{f.libelle}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {f.centre || "Les deux"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <SupprimerFerie jour={f.jour} libelle={f.libelle} centre={f.centre} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </GlassCard>
        </>
      )}
    </main>
  );
}

function enClair(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
