import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { GlassCard } from "@/components/glass/glass-card";
import { BadgeSite } from "@/components/pointage/badge-site";
import { listAgents, type Agent, nomAffiche } from "@/lib/pointage/data";
import { listAffectations, listCreneaux, listPlannings, type Planning } from "@/lib/planning/data";
import { versHeures } from "@/lib/pointage/calcul";
import { dureeCreneau, type Creneau } from "@/lib/planning/creneau";

import { GrillePlanning, LegendeGrille, type CreneauOption } from "./grille";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Édition du planning" };

const ABREGES = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

/** Étiquette compacte d'un créneau, lisible dans une cellule étroite. */
function court(c: Creneau): string {
  if (c.type === "repos") return c.libelle;
  const h = versHeures(dureeCreneau(c));
  return c.debut && c.fin ? `${c.debut}-${c.fin} (${h})` : `${c.libelle} (${h})`;
}

export default async function EditionPlanningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "pointage:gerer")) redirect("/pointage");

  const { id } = await params;
  const plannings = await safe<Planning[]>(() => listPlannings(), []);
  const planning = plannings.data.find((p) => p.id === id);
  if (!planning) notFound();

  const [agentsRes, creneauxRes, affRes] = await Promise.all([
    safe<Agent[]>(() => listAgents(), []),
    safe<Creneau[]>(() => listCreneaux(), []),
    safe(() => listAffectations(id), []),
  ]);

  // Seuls les agents du centre concerné : afficher les 66 agents ferait une
  // grille illisible, dont l'essentiel resterait vide.
  const agents = agentsRes.data
    .filter((a) => a.actif && a.site === planning.centre)
    .map((a) => ({ id: a.id, nom: nomAffiche(a), statut: a.statut }))
    .sort((x, y) => x.nom.localeCompare(y.nom));

  const jours: Array<{ date: string; num: string; abrege: string; weekend: boolean }> = [];
  const d = new Date(`${planning.du}T12:00:00Z`);
  const fin = new Date(`${planning.au}T12:00:00Z`);
  while (d <= fin && jours.length < 62) {
    const date = d.toISOString().slice(0, 10);
    const jsem = d.getUTCDay();
    jours.push({
      date,
      num: date.slice(8, 10),
      abrege: ABREGES[jsem],
      weekend: jsem === 0,
    });
    d.setUTCDate(d.getUTCDate() + 1);
  }

  const creneaux: CreneauOption[] = creneauxRes.data
    // Le catalogue est déjà filtré côté base ; on garde tous les modèles.
    .map((c) => ({ id: c.id, libelle: c.libelle, type: c.type, court: court(c) }));

  const affectations: Record<string, string> = {};
  for (const a of affRes.data) affectations[`${a.agent_id}|${a.jour}`] = a.creneau_id;

  const heuresTotal = affRes.data.reduce((s, a) => {
    const c = creneauxRes.data.find((x) => x.id === a.creneau_id);
    return s + (c ? dureeCreneau(c) : 0);
  }, 0);

  return (
    <main id="main-content" className="mx-auto max-w-[1400px] flex-1 p-4 md:p-8 space-y-5">
      <div>
        <Link
          href="/pointage/planning"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Plannings
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <BadgeSite site={planning.centre} />
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
            {planning.libelle}
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {planning.du} → {planning.au} · {agents.length} agents · {jours.length} jours ·{" "}
          {affRes.data.length} affectations ({versHeures(heuresTotal)})
        </p>
      </div>

      <LegendeGrille />

      <GlassCard className="p-2">
        <GrillePlanning
          planningId={id}
          jours={jours}
          agents={agents}
          creneaux={creneaux}
          affectations={affectations}
        />
      </GlassCard>

      <p className="text-[11px] text-muted-foreground">
        Chaque modification est enregistrée immédiatement. Choisir « — » retire l&apos;affectation :
        une cellule vide signifie « non planifié », ce qui n&apos;est pas la même chose
        qu&apos;un repos — celui-ci se choisit explicitement.
      </p>
    </main>
  );
}
