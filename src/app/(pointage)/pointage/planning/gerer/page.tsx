import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { GlassCard } from "@/components/glass/glass-card";
import { listPlannings, listAffectations, type Planning } from "@/lib/planning/data";

import { NouveauPlanning, PlanningRow, type PlanningLigne } from "../planning-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gérer les plannings — Pointage" };

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ centre?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "planning:gerer")) redirect("/pointage");
  const t = getT(session.user.lang);

  const sp = await searchParams;
  const filtre = (sp.centre ?? "").toUpperCase();

  const res = await safe<Planning[]>(() => listPlannings(), []);
  const plannings = res.data.filter((p) => !filtre || p.centre === filtre);

  // Nombre d'affectations par planning, pour situer l'avancement.
  const lignes: PlanningLigne[] = await Promise.all(
    plannings.map(async (p) => {
      const aff = await safe(() => listAffectations(p.id), []);
      return {
        id: p.id,
        centre: p.centre,
        du: p.du,
        au: p.au,
        libelle: p.libelle,
        statut: p.statut,
        token: p.token_public,
        publieLe: p.publie_le,
        nbAffectations: aff.data.length,
      };
    }),
  );

  // Origine réelle de la requête : le lien communiqué au personnel doit
  // fonctionner tel quel, en production comme en développement.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "";
  const origine = host ? `${proto}://${host}` : "";

  return (
    <main id="main-content" className="mx-auto max-w-4xl flex-1 p-4 md:p-10 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/pointage/planning"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Retour au tableau
          </Link>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
            Gérer les plannings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lignes.length} planning(s) · publiez pour obtenir un lien consultable par le personnel
          </p>
        </div>
        <NouveauPlanning />
      </div>

      {/* Filtre par centre — conservé dans l'URL, donc partageable. */}
      <nav className="flex gap-2" aria-label="Filtrer par centre">
        {[
          { v: "", l: "Tous les centres" },
          { v: "REX", l: "REX" },
          { v: "MIARAKA", l: "MIARAKA" },
        ].map((f) => (
          <Link
            key={f.v}
            href={f.v ? `/pointage/planning/gerer?centre=${f.v}` : "/pointage/planning/gerer"}
            aria-current={filtre === f.v ? "page" : undefined}
            className={
              filtre === f.v
                ? "rounded-xl border border-accent/40 bg-accent/12 px-3 py-1.5 text-sm text-accent"
                : "rounded-xl border border-glass-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/5 transition-colors"
            }
          >
            {f.l}
          </Link>
        ))}
      </nav>

      {lignes.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <CalendarDays className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground">
            Aucun planning enregistré. Créez-en un pour commencer, ou attendez la reprise de vos
            plannings existants.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {lignes.map((p) => (
            <PlanningRow key={p.id} p={p} origine={origine} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Un planning en brouillon n&apos;est accessible par aucune adresse. Le lien n&apos;est
        engendré qu&apos;à la publication et reste le même en cas de republication, pour que le
        personnel n&apos;ait jamais à changer de signet.
      </p>
    </main>
  );
}
