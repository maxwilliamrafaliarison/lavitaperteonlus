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
import { PlanningGantt, type Teinte } from "./gantt";
import { SelecteurVue, dureeDe, decalerJour, type Vue } from "./selecteur-vue";
import { type BlocEdt } from "./edt";
import { DupliquerSemaine } from "./dupliquer-semaine";
import { EdtSolo } from "./edt-solo";
import { PanneauAlertes } from "./panneau-alertes";
import { BarreSemaines, type SemaineBarre } from "./barre-semaines";
import { PostesAttente, type PosteAttente } from "./postes-attente";

import { verifierFenetre, PREFIXE_ATTENTE } from "./verif";

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
  searchParams: Promise<{ vue?: string; debut?: string; mode?: string; agent?: string; teinte?: string }>;
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
  /* Ce qui pilote la couleur vit dans l'URL, comme l'étendue : la vue se
     partage, se met en favori et survit au rafraîchissement. */
  const teinte = (sp.teinte === "service" ? "service" : "type") as Teinte;
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
  /* Les teintes viennent de la base : la DRH peut les changer sans qu'on
     redéploie. Un service sans couleur retombe sur un gris qui se voit — ce
     n'est pas un défaut discret, c'est un réglage qui manque. */
  const couleursServices = Object.fromEntries(
    servicesRes.data.filter((s2) => s2.couleur).map((s2) => [s2.id, s2.couleur]),
  );
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
  /* CE QUE LA GRILLE SIGNALE D'ELLE-MÊME. Le contrôle légal ne s'exécutait
     qu'après une saisie : une semaine recopiée depuis la précédente pouvait
     être illégale sans qu'un seul message n'apparaisse. Il tourne désormais
     sur la fenêtre affichée, à chaque rendu. */
  const nomsAgents = new Map(agents.map((a) => [a.id, a.nom]));
  const alertes = await safe(
    () => verifierFenetre(debut, finFenetre, (id) => nomsAgents.get(id) ?? id),
    [],
  );

  const blocsParService: Record<string, BlocEdt[]> = {};
  const reposParService: Record<string, Array<{ jour: string; agentNom: string; motif: string }>> = {};
  for (const a of affRes.data) {
    if (a.jour < debut || a.jour > auAffiche) continue;
    const agent = infoAgent.get(a.agent_id);
    if (!agent) continue;
    const c = parCreneauMap.get(a.creneau_id);
    if (!c) continue;
    // La grille horaire est PAR PERSONNE dans les deux centres (demande du
    // responsable) : les blocs se rattachent à l'agent. Le service, lui,
    // reste porté par l'affectation — la présentation change, pas la donnée.
    const cle = `ag:${a.agent_id}`;
    if (c.type === "repos") {
      (reposParService[cle] ??= []).push({ jour: a.jour, agentNom: agent.nom, motif: c.libelle });
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
    (blocsParService[cle] ??= []).push({ ...base, debut: d0, fin: f0, type });
    // Journée coupée : le modèle porte une seconde plage (après-midi).
    if (!a.debut && c.debut2 && c.fin2) {
      (blocsParService[cle] ??= []).push({ ...base, debut: c.debut2, fin: c.fin2, type, partie: 2 });
    }
  }
  // Grille horaire PAR PERSONNE : une section par agent, avec sa propre
  // amplitude (le gardien vit sur 24 h, l'administratif sur 7h-17h). Le
  // service connu de l'agent apparaît en sous-titre et reste attaché aux
  // affectations créées depuis sa section.
  const agentChoisi = /^AG-[A-Z]+-\d+$/.test(sp.agent ?? "") ? sp.agent! : "";
  const groupesEdt = agents
    .map((a) => {
      const sid = parAgentService.get(a.id) ?? "";
      const svc = sid ? libelleService.get(sid) : "";
      return {
        cle: `ag:${a.id}`,
        service: sid,
        libelle: svc ? `${a.nom} — ${svc}` : a.nom,
        agents: [a],
      };
    })
    .sort((x, y) => x.libelle.localeCompare(y.libelle));

  const tousAgents = agents.map((a) => ({ id: a.id, nom: a.nom }));
  /* BARRE DES SEMAINES. Une semaine par case, avec son nombre
     d'affectations : une semaine encore vide se voit alors sans qu'on
     l'ouvre. C'est ce qui manquait le 13 août, où la semaine en cours
     n'existait pas et où l'écran des écarts affichait vingt-deux personnes
     « hors planning » sans que personne ne l'ait remarqué. */
  const lundiDe = (j: string) => {
    const d = new Date(`${j}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const numeroIso = (j: string) => {
    const d = new Date(`${j}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 4 - ((d.getUTCDay() + 6) % 7));
    const debutAn = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - debutAn.getTime()) / 86400000 + 1) / 7);
  };
  const affParSemaine = new Map<string, number>();
  for (const a of affRes.data) {
    const l = lundiDe(a.jour);
    affParSemaine.set(l, (affParSemaine.get(l) ?? 0) + 1);
  }
  const semaines: SemaineBarre[] = [];
  for (let l = lundiDe(planning.du); l <= planning.au; l = decalerJour(l, 7)) {
    semaines.push({ debut: l, numero: numeroIso(l), affectations: affParSemaine.get(l) ?? 0 });
  }

  /* POSTES À POURVOIR — des affectations sans titulaire, sur la fenêtre
     affichée. Elles ne figurent pas dans la grille : aucune ligne d'agent
     ne leur correspond, et c'est justement ce qui les rend visibles ici. */
  const libelleCreneau = new Map(creneauxRes.data.map((c) => [c.id, c.libelle]));
  const postesAttente: PosteAttente[] = affRes.data
    .filter(
      (a) => a.agent_id.startsWith(PREFIXE_ATTENTE) && a.jour >= debut && a.jour <= finFenetre,
    )
    .sort((x, y) => x.jour.localeCompare(y.jour))
    .map((a) => ({
      id: a.id,
      jour: a.jour,
      creneauId: a.creneau_id,
      creneauLibelle: libelleCreneau.get(a.creneau_id) ?? a.creneau_id,
      serviceId: a.service_id,
      serviceLibelle: libelleService.get(a.service_id) ?? "",
      note: a.note ?? "",
    }));

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
        <nav className="flex gap-1 rounded-xl border border-glass-border p-1" aria-label="Ce qui pilote la couleur">
          {([
            { id: "type", libelle: "Couleur : forme du poste" },
            { id: "service", libelle: "Couleur : service" },
          ] as const).map((t) => (
            <Link
              key={t.id}
              href={`/pointage/planning/${id}?vue=${vue}&debut=${debut}&mode=${mode}&teinte=${t.id}`}
              className={
                teinte === t.id
                  ? "rounded-lg bg-accent/15 px-3 py-1 text-xs font-medium text-accent"
                  : "rounded-lg px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              }
            >
              {t.libelle}
            </Link>
          ))}
        </nav>

        <SelecteurVue
          planningId={id}
          vue={vue}
          debut={debut}
          bornes={{ du: planning.du, au: planning.au }}
        />
        <div className="flex flex-wrap items-center gap-2">
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
          <EdtSolo
            planningId={id}
            editable
            jours={jours}
            groupes={groupesEdt}
            blocs={blocsParService}
            repos={reposParService}
            tousAgents={tousAgents}
            selectionInitiale={agentChoisi}
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
            teinte={teinte}
            couleursServices={couleursServices}
          />
        )}
      </GlassCard>

      <PostesAttente
        planningId={id}
        postes={postesAttente}
        jours={jours.map((j) => j.date)}
        creneaux={creneaux}
        services={servicesRes.data
          .filter((s2) => s2.centre === planning.centre)
          .map((s2) => ({ id: s2.id, libelle: s2.libelle }))}
        agents={agents.map((a) => ({ id: a.id, nom: a.nom }))}
        editable={planning.statut !== "archive"}
      />

      <BarreSemaines
        planningId={id}
        semaines={semaines}
        courante={lundiDe(debut)}
        lien={(d) => `/pointage/planning/${id}?vue=semaine&debut=${d}`}
        /* Un planning archivé se consulte, ne se propage pas : proposer
           un geste que le serveur refusera ensuite est pire que de ne pas
           le proposer. */
        editable={planning.statut !== "archive"}
      />

      <PanneauAlertes alertes={alertes.data} />

      <p className="text-[11px] text-muted-foreground">
        Chaque modification est enregistrée immédiatement et reste soumise aux contrôles légaux
        (repos de 11 h, plafond hebdomadaire). Une cellule vide signifie « non planifié », ce qui
        n&apos;est pas la même chose qu&apos;un repos — celui-ci se choisit explicitement.
      </p>
    </main>
  );
}
