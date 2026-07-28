import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Settings2 } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { GlassCard } from "@/components/glass/glass-card";
import { BadgeSite } from "@/components/pointage/badge-site";
import { listAgents, type Agent, nomAffiche } from "@/lib/pointage/data";
import { listAffectations, listCreneaux, listPlannings, listServices, type Planning } from "@/lib/planning/data";
import { versHeures } from "@/lib/pointage/calcul";
import { dureeCreneau, type Creneau } from "@/lib/planning/creneau";

import { type CreneauOption } from "./grille";
import { PlanningGantt } from "./gantt";
import { SelecteurVue, dureeDe, decalerJour, type Vue } from "./selecteur-vue";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vue?: string; debut?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "planning:gerer")) redirect("/pointage");

  const { id } = await params;
  const plannings = await safe<Planning[]>(() => listPlannings(), []);
  const planning = plannings.data.find((p) => p.id === id);
  if (!planning) notFound();

  const [agentsRes, creneauxRes, affRes, servicesRes] = await Promise.all([
    safe<Agent[]>(() => listAgents(), []),
    safe<Creneau[]>(() => listCreneaux(), []),
    safe(() => listAffectations(id), []),
    safe(() => listServices(), []),
  ]);

  // Seuls les agents du centre concerné : afficher les 66 agents ferait une
  // grille illisible, dont l'essentiel resterait vide.
  const agents = agentsRes.data
    .filter((a) => a.actif && a.site === planning.centre)
    .map((a) => ({ id: a.id, nom: nomAffiche(a), statut: a.statut }))
    .sort((x, y) => x.nom.localeCompare(y.nom));

  // Fenêtre affichée : l'étendue et son point de départ vivent dans l'URL,
  // ce qui rend chaque vue partageable et navigable avec les flèches du
  // navigateur.
  const sp = await searchParams;
  const VUES_OK = ["jour", "semaine", "mois", "six"];
  const vue = (VUES_OK.includes(sp.vue ?? "") ? sp.vue : "mois") as Vue;
  const debut =
    /^\d{4}-\d{2}-\d{2}$/.test(sp.debut ?? "") && sp.debut! >= planning.du && sp.debut! <= planning.au
      ? sp.debut!
      : planning.du;
  const finFenetre = decalerJour(debut, dureeDe(vue) - 1);
  const auAffiche = finFenetre > planning.au ? planning.au : finFenetre;
  const densite = vue === "six" ? "minimale" : vue === "mois" ? "compacte" : "large";

  // Onglet de bascule : pour chaque centre, le planning couvrant la période
  // affichée — à défaut le plus proche. La période et l'étendue suivent, si
  // bien qu'on compare les deux centres sur la même semaine.
  const ongletVers = (c: string): string | null => {
    const cand = plannings.data
      .filter((p2) => p2.centre === c)
      .sort((a, b) => b.du.localeCompare(a.du));
    if (!cand.length) return null;
    const cible = cand.find((p2) => p2.du <= debut && debut <= p2.au) ?? cand.find((p2) => p2.du <= debut) ?? cand[cand.length - 1];
    return `/pointage/planning/${cible.id}?vue=${vue}&debut=${debut}`;
  };

  const jours: Array<{ date: string; num: string; abrege: string; weekend: boolean }> = [];
  const d = new Date(`${debut}T12:00:00Z`);
  const fin = new Date(`${auAffiche}T12:00:00Z`);
  while (d <= fin && jours.length < 200) {
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
    .map((c) => ({ id: c.id, libelle: c.libelle, type: c.type, court: court(c), debut: c.debut, fin: c.fin }));

  const affectations: Record<string, { creneauId: string; debut: string; fin: string; lieu: string }> = {};
  for (const a of affRes.data) {
    if (a.jour < debut || a.jour > auAffiche) continue;
    affectations[`${a.agent_id}|${a.jour}`] = {
      creneauId: a.creneau_id, debut: a.debut, fin: a.fin, lieu: a.lieu,
    };
  }

  // Regroupement par service, à la manière d'un planning de chantier : on
  // lit d'abord « qui couvre la réception », pas « où est Untel ».
  const parAgentService = new Map<string, string>();
  for (const a of affRes.data) if (a.service_id) parAgentService.set(a.agent_id, a.service_id);
  const libelleService = new Map(servicesRes.data.map((s2) => [s2.id, s2.libelle]));
  const rangService = new Map(servicesRes.data.map((s2) => [s2.id, s2.rang]));
  const groupesMap = new Map<string, typeof agents>();
  for (const a of agents) {
    const sid = parAgentService.get(a.id) ?? "";
    groupesMap.set(sid, [...(groupesMap.get(sid) ?? []), a]);
  }
  const groupes = [...groupesMap.entries()]
    .map(([service, ag]) => ({
      service,
      libelle: libelleService.get(service) ?? "Sans service assigné",
      agents: ag,
    }))
    .sort((x, y) => (rangService.get(x.service) ?? 9999) - (rangService.get(y.service) ?? 9999));

  const heuresTotal = affRes.data.reduce((s, a) => {
    const c = creneauxRes.data.find((x) => x.id === a.creneau_id);
    return s + (c ? dureeCreneau(c) : 0);
  }, 0);

  return (
    <main id="main-content" className="mx-auto max-w-[1400px] flex-1 p-4 md:p-8 space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Bascule de centre : deux onglets permanents, période conservée. */}
          <nav className="flex gap-1 rounded-xl border border-glass-border p-1" aria-label="Centre affiché">
            {(["REX", "MIARAKA"] as const).map((c) => {
              const href = ongletVers(c);
              const actif = planning.centre === c;
              if (!href) {
                return (
                  <span key={c} className="rounded-lg px-4 py-1.5 text-sm text-muted-foreground/40" title="Aucun planning pour ce centre">
                    {c}
                  </span>
                );
              }
              return (
                <Link
                  key={c}
                  href={href}
                  aria-current={actif ? "page" : undefined}
                  className={
                    actif
                      ? "rounded-lg bg-accent/15 px-4 py-1.5 text-sm font-medium text-accent"
                      : "rounded-lg px-4 py-1.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
                  }
                >
                  {c}
                </Link>
              );
            })}
          </nav>
          <Link
            href="/pointage/planning/gerer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-glass-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          >
            <Settings2 className="size-3.5" aria-hidden="true" />
            Gérer les plannings
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <BadgeSite site={planning.centre} />
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
            {planning.libelle}
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Affiché : {debut} → {auAffiche} · {jours.length} jours · {agents.length} agents
          <span className="text-muted-foreground/70">
            {" "}· planning complet {planning.du} → {planning.au}, {affRes.data.length} affectations
            ({versHeures(heuresTotal)})
          </span>
        </p>
      </div>

      <SelecteurVue
        planningId={id}
        vue={vue}
        debut={debut}
        bornes={{ du: planning.du, au: planning.au }}
      />

      <GlassCard className="p-3">
        <PlanningGantt
          planningId={id}
          jours={jours}
          groupes={groupes}
          creneaux={creneaux}
          affectations={affectations}
          editable
          densite={densite}
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
