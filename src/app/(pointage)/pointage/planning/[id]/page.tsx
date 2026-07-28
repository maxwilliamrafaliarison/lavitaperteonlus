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
import { PlanningEdt, type BlocEdt } from "./edt";
import { DupliquerSemaine } from "./dupliquer-semaine";

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
  searchParams: Promise<{ vue?: string; debut?: string; mode?: string }>;
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
  // Deux représentations (réponse 5) : la grille HORAIRE type EDT pour le
  // jour et la semaine, les BARRES pour le mois et le semestre — 31 colonnes
  // d'heures ne se dessinent pas. Le mode vit dans l'URL comme le reste.
  const edtPossible = vue === "jour" || vue === "semaine";
  const mode = !edtPossible ? "barres" : sp.mode === "barres" ? "barres" : "edt";

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

  // ── Données de la grille horaire ─────────────────────────────────────────
  const parCreneauMap = new Map(creneauxRes.data.map((c) => [c.id, c]));
  const infoAgent = new Map(agents.map((a) => [a.id, a]));
  const blocsParService: Record<string, BlocEdt[]> = {};
  const reposParService: Record<string, Array<{ jour: string; agentNom: string; motif: string }>> = {};
  for (const a of affRes.data) {
    if (a.jour < debut || a.jour > auAffiche) continue;
    const agent = infoAgent.get(a.agent_id);
    if (!agent) continue;
    const c = parCreneauMap.get(a.creneau_id);
    if (!c) continue;
    const sid = parAgentService.get(a.agent_id) ?? a.service_id ?? "";
    if (c.type === "repos") {
      (reposParService[sid] ??= []).push({ jour: a.jour, agentNom: agent.nom, motif: c.libelle });
      continue;
    }
    const d0 = a.debut || c.debut;
    const f0 = a.fin || c.fin;
    if (!d0 || !f0) continue;
    // Un horaire libre n'a pas de famille : on la déduit de ses bornes.
    const type = c.id === "libre" ? (f0 <= d0 ? "garde_nuit" : "journee") : c.type;
    const base = {
      affId: a.id, agentId: a.agent_id, agentNom: agent.nom, jour: a.jour,
      lieu: a.lieu, creneauId: a.creneau_id, surchargeDebut: a.debut, surchargeFin: a.fin,
    };
    (blocsParService[sid] ??= []).push({ ...base, debut: d0, fin: f0, type });
    // Journée coupée : le modèle porte une seconde plage (après-midi).
    if (!a.debut && c.debut2 && c.fin2) {
      (blocsParService[sid] ??= []).push({ ...base, debut: c.debut2, fin: c.fin2, type, partie: 2 });
    }
  }
  const tousAgents = agents.map((a) => ({ id: a.id, nom: a.nom }));
  const semainePrecedente = decalerJour(debut, -7);
  const peutRecopier = mode === "edt" && vue === "semaine" && semainePrecedente >= planning.du;

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelecteurVue
          planningId={id}
          vue={vue}
          debut={debut}
          bornes={{ du: planning.du, au: planning.au }}
        />
        <div className="flex items-center gap-2">
          {peutRecopier && (
            <DupliquerSemaine planningId={id} source={semainePrecedente} cible={debut} />
          )}
          {edtPossible && (
            <nav className="flex gap-1 rounded-xl border border-glass-border p-1" aria-label="Représentation">
              {([["edt", "Horaire"], ["barres", "Barres"]] as const).map(([m, l]) => (
                <Link
                  key={m}
                  href={`/pointage/planning/${id}?vue=${vue}&debut=${debut}&mode=${m}`}
                  aria-current={mode === m ? "page" : undefined}
                  className={
                    mode === m
                      ? "rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent"
                      : "rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
                  }
                >
                  {l}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>

      <GlassCard className="p-3">
        {mode === "edt" ? (
          <PlanningEdt
            planningId={id}
            editable
            jours={jours}
            groupes={groupes}
            blocs={blocsParService}
            repos={reposParService}
            tousAgents={tousAgents}
          />
        ) : (
          <PlanningGantt
            planningId={id}
            jours={jours}
            groupes={groupes}
            creneaux={creneaux}
            affectations={affectations}
            editable
            densite={densite}
          />
        )}
      </GlassCard>

      <p className="text-[11px] text-muted-foreground">
        Chaque modification est enregistrée immédiatement et reste soumise aux contrôles légaux
        (repos de 11 h, plafond hebdomadaire). Une cellule vide signifie « non planifié », ce qui
        n&apos;est pas la même chose qu&apos;un repos — celui-ci se choisit explicitement.
      </p>
    </main>
  );
}
