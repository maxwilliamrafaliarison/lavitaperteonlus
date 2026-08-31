import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { GlassCard } from "@/components/glass/glass-card";
import { sbSelect } from "@/lib/supabase-server";
import { dureePlage, type Creneau } from "@/lib/planning/creneau";

import { CreneauRow, type CreneauLigne } from "./creneau-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Créneaux types (Pointage)" };

const GROUPES: Array<{ type: string; titre: string; aide: string }> = [
  { type: "garde_nuit", titre: "Gardes et postes de nuit", aide: "Ces créneaux traversent minuit : leur heure de fin appartient au lendemain." },
  { type: "journee", titre: "Journées continues", aide: "" },
  { type: "fractionnee", titre: "Journées coupées", aide: "Matin et après-midi, avec pause méridienne." },
  { type: "demi", titre: "Demi-journées", aide: "" },
  { type: "repos", titre: "Repos et absences", aide: "Aucune heure décomptée." },
];

export default async function CreneauxPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "pointage:gerer")) redirect("/pointage");
  const t = getT(session.user.lang);

  const res = await safe<Creneau[]>(async () => {
    const { rows } = await sbSelect<Creneau>("planning", "creneaux", {
      select: "*",
      order: "type.asc,minutes.desc",
      limit: 200,
    });
    return rows;
  }, []);

  const lignes: CreneauLigne[] = res.data.map((c) => ({
    id: c.id,
    libelle: c.libelle,
    type: c.type,
    debut: c.debut,
    fin: c.fin,
    minutes: Number(c.minutes),
    amplitude:
      c.debut && c.fin
        ? dureePlage(c.debut, c.fin) + (c.debut2 && c.fin2 ? dureePlage(c.debut2, c.fin2) : 0)
        : 0,
  }));

  return (
    <main id="main-content" className="mx-auto max-w-5xl flex-1 p-4 md:p-10 space-y-6">
      <div>
        <Link
          href="/pointage"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("pointage.title")}
        </Link>
        <h1 className="mt-3 font-display text-xl font-semibold tracking-tight">
          {t("pointage.nav_creneaux")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {lignes.length} créneaux · la durée retenue sert de base au calcul du temps de travail
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-glass-border bg-white/3 px-4 py-3 text-sm text-muted-foreground">
        <Clock className="size-4 shrink-0 mt-0.5 text-accent" aria-hidden="true" />
        <span>
          <strong className="text-foreground">L&apos;amplitude</strong> est calculée depuis les
          horaires du créneau ; <strong className="text-foreground">la durée retenue</strong> est
          ce que l&apos;établissement décide de décompter. Les deux peuvent légitimement différer :
          une garde inclut parfois des heures de repos non payées. Un écart est signalé, jamais
          corrigé d&apos;office.
        </span>
      </div>

      {GROUPES.map((g) => {
        const items = lignes.filter((l) => l.type === g.type);
        if (items.length === 0) return null;
        return (
          <GlassCard key={g.type} className="overflow-x-auto p-0">
            <div className="border-b border-glass-border px-5 py-3">
              <h2 className="font-display text-base font-semibold">{g.titre}</h2>
              {g.aide && <p className="mt-0.5 text-xs text-muted-foreground">{g.aide}</p>}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-glass-border text-left">
                  <Th>Créneau</Th>
                  <Th>Horaires</Th>
                  <Th className="text-right">Amplitude</Th>
                  <Th className="text-right">Durée retenue</Th>
                  <Th className="text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border">
                {items.map((c) => (
                  <CreneauRow key={c.id} c={c} />
                ))}
              </tbody>
            </table>
          </GlassCard>
        );
      })}

      <p className="text-[11px] text-muted-foreground">
        Modifier une durée n&apos;altère aucun pointage déjà enregistré : le calcul est refait à
        la lecture. Les états mensuels reflètent le barème en vigueur au moment où ils sont
        édités.
      </p>
    </main>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-5 py-2.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
