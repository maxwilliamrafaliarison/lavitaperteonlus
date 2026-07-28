import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { planningParToken, listAffectations, listCreneaux, listServices } from "@/lib/planning/data";
import { listAgents, nomAffiche, type Agent } from "@/lib/pointage/data";
import { aujourdhui, formaterDateHeure } from "@/lib/tz";

import { BoutonImprimer } from "./imprimer";

export const dynamic = "force-dynamic";

/* ============================================================
   PAGE PUBLIQUE DU PLANNING — grille hebdomadaire, par lien secret
   ============================================================
   Consultée sans compte, surtout depuis un téléphone, et affichée au mur
   après impression. La liste jour-par-jour d'origine obligeait à dérouler
   longuement pour se trouver ; la grille services × jours donne la semaine
   d'un regard, le jour courant surligné.

   Sur les MOTIFS D'ABSENCE : ils sont affichés (congé, maternité, férié…)
   sur décision expresse du responsable, réaffirmée après signalement de la
   sensibilité de ces informations. La page reste non indexée et accessible
   par jeton secret uniquement.
   ============================================================ */

export const metadata: Metadata = {
  title: "Planning",
  robots: { index: false, follow: false, nocache: true },
};

const JOURS_COURT = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

const decaler = (j: string, n: number) => {
  const d = new Date(`${j}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const lundiDe = (j: string) => {
  const d = new Date(`${j}T12:00:00Z`);
  return decaler(j, -((d.getUTCDay() + 6) % 7));
};

interface Entree {
  agent: string;
  heures: string;
  type: string;
  lieu: string;
  repos: boolean;
  motif: string;
}

/** Bordure gauche colorée par famille — lisible aussi imprimée en gris. */
const BORDURE: Record<string, string> = {
  journee: "border-l-emerald-500",
  fractionnee: "border-l-sky-500",
  demi: "border-l-amber-500",
  garde_nuit: "border-l-purple-500",
  astreinte: "border-l-indigo-400",
  repos: "border-l-neutral-300 dark:border-l-neutral-600",
};

export default async function PlanningPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ s?: string; service?: string; vue?: string }>;
}) {
  const { token } = await params;
  const planning = await planningParToken(token);
  if (!planning) notFound();

  const [affectations, creneaux, services, agents] = await Promise.all([
    listAffectations(planning.id),
    listCreneaux(),
    listServices(),
    listAgents(),
  ]);
  const parCreneau = new Map(creneaux.map((c) => [c.id, c]));
  const libelleService = new Map(services.map((s) => [s.id, s.libelle]));
  const rangService = new Map(services.map((s) => [s.id, s.rang]));
  const parAgent = new Map<string, Agent>(agents.map((a) => [a.id, a]));

  const sp = await searchParams;
  const jourJ = aujourdhui();
  const vue = sp.vue === "mois" ? "mois" : "semaine";
  const filtreService = sp.service ?? "";

  // Semaine affichée : celle demandée, sinon celle du jour, bornée au planning.
  let ancre = /^\d{4}-\d{2}-\d{2}$/.test(sp.s ?? "") ? sp.s! : jourJ;
  if (ancre < planning.du) ancre = planning.du;
  if (ancre > planning.au) ancre = planning.au;

  // Les semaines à rendre : une seule, ou toutes celles du mois de l'ancre.
  const lundis: string[] = [];
  if (vue === "semaine") {
    lundis.push(lundiDe(ancre));
  } else {
    const mois = ancre.slice(0, 7);
    let l = lundiDe(`${mois}-01`);
    while (l.slice(0, 7) <= mois) {
      if (decaler(l, 6) >= planning.du && l <= planning.au) lundis.push(l);
      l = decaler(l, 7);
    }
  }

  // Cellules : (service, jour) → entrées triées par heure de début.
  const cellule = new Map<string, Entree[]>();
  const servicesVus = new Set<string>();
  for (const a of affectations) {
    const c = parCreneau.get(a.creneau_id);
    const agent = parAgent.get(a.agent_id);
    if (!c || !agent) continue;
    const sid = a.service_id ?? "";
    servicesVus.add(sid);
    if (filtreService && sid !== filtreService) continue;
    const repos = c.type === "repos";
    const d0 = a.debut || c.debut;
    const f0 = a.fin || c.fin;
    const heures = repos
      ? ""
      : d0 && f0
        ? `${d0}–${f0 === "00:00" ? "24:00" : f0}${c.debut2 && !a.debut ? ` · ${c.debut2}–${c.fin2}` : ""}`
        : "";
    const cle = `${sid}|${a.jour}`;
    cellule.set(cle, [
      ...(cellule.get(cle) ?? []),
      {
        agent: nomAffiche(agent),
        heures,
        type: c.id === "libre" && f0 <= d0 ? "garde_nuit" : c.type,
        lieu: a.lieu,
        repos,
        motif: repos ? c.libelle : "",
      },
    ]);
  }
  for (const entrees of cellule.values()) {
    entrees.sort((a, b) => (a.repos ? 1 : 0) - (b.repos ? 1 : 0) || a.heures.localeCompare(b.heures));
  }

  const listeServices = [...servicesVus].sort(
    (a, b) => (rangService.get(a) ?? 9999) - (rangService.get(b) ?? 9999),
  );
  const nomService = (sid: string) => libelleService.get(sid) ?? "Autres";

  const lien = (q: { s?: string; service?: string; vue?: string }) => {
    const p = new URLSearchParams();
    p.set("s", q.s ?? ancre);
    const svc = q.service !== undefined ? q.service : filtreService;
    if (svc) p.set("service", svc);
    if ((q.vue ?? vue) === "mois") p.set("vue", "mois");
    return `/planning/${token}?${p.toString()}`;
  };
  const pas = vue === "mois" ? 31 : 7;

  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-4 py-6 print:max-w-none print:px-0 print:py-0">
      {/* En-tête. */}
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-3 dark:border-white/10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
            Centre {planning.centre} · La Vita Per Te
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight md:text-2xl">
            {planning.libelle || "Planning de travail"}
          </h1>
          {planning.publie_le && (
            <p className="mt-0.5 text-[11px] text-neutral-500">
              Mis à jour le {formaterDateHeure(planning.publie_le)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Link
            href={lien({ vue: "semaine" })}
            className={vue === "semaine" ? "rounded-xl bg-black/10 px-3 py-1.5 text-xs font-medium dark:bg-white/15" : "rounded-xl border border-black/15 px-3 py-1.5 text-xs text-neutral-600 dark:border-white/15 dark:text-neutral-300"}
          >
            Semaine
          </Link>
          <Link
            href={lien({ vue: "mois" })}
            className={vue === "mois" ? "rounded-xl bg-black/10 px-3 py-1.5 text-xs font-medium dark:bg-white/15" : "rounded-xl border border-black/15 px-3 py-1.5 text-xs text-neutral-600 dark:border-white/15 dark:text-neutral-300"}
          >
            Mois
          </Link>
          <BoutonImprimer />
        </div>
      </header>

      {/* Navigation + filtre service. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <Link href={lien({ s: decaler(ancre, -pas) })} aria-label="Période précédente" className="inline-flex size-8 items-center justify-center rounded-lg border border-black/15 text-neutral-600 hover:bg-black/5 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/5">
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Link>
          <Link href={lien({ s: decaler(ancre, pas) })} aria-label="Période suivante" className="inline-flex size-8 items-center justify-center rounded-lg border border-black/15 text-neutral-600 hover:bg-black/5 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/5">
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href={lien({ s: jourJ })} className="rounded-lg border border-black/15 px-2.5 py-1.5 text-xs text-neutral-600 hover:bg-black/5 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/5">
            Aujourd&apos;hui
          </Link>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Filtrer par service">
          <Link
            href={lien({ service: "" })}
            className={!filtreService ? "rounded-full bg-black/10 px-2.5 py-1 text-[11px] font-medium dark:bg-white/15" : "rounded-full border border-black/15 px-2.5 py-1 text-[11px] text-neutral-500 dark:border-white/15"}
          >
            Tous
          </Link>
          {listeServices.map((sid) => (
            <Link
              key={sid || "autres"}
              href={lien({ service: sid })}
              className={filtreService === sid ? "rounded-full bg-black/10 px-2.5 py-1 text-[11px] font-medium dark:bg-white/15" : "rounded-full border border-black/15 px-2.5 py-1 text-[11px] text-neutral-500 dark:border-white/15"}
            >
              {nomService(sid)}
            </Link>
          ))}
        </nav>
      </div>

      {/* Une grille par semaine. */}
      <div className="space-y-8">
        {lundis.map((lundi) => {
          const jours = Array.from({ length: 7 }, (_, i) => decaler(lundi, i));
          const servicesSemaine = listeServices.filter(
            (sid) =>
              (!filtreService || sid === filtreService) &&
              jours.some((j) => (cellule.get(`${sid}|${j}`) ?? []).length > 0),
          );
          return (
            <section key={lundi} className="break-inside-avoid-page">
              <h2 className="mb-2 text-sm font-semibold">
                Semaine du {lundi.slice(8, 10)}/{lundi.slice(5, 7)} au {decaler(lundi, 6).slice(8, 10)}/{decaler(lundi, 6).slice(5, 7)}
              </h2>
              <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10 print:overflow-visible print:rounded-none print:border-neutral-400">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-black/[0.04] dark:bg-white/[0.06] print:bg-neutral-100">
                      <th scope="col" className="min-w-28 border-b border-black/10 px-2 py-1.5 text-left text-[10px] uppercase tracking-wide text-neutral-500 dark:border-white/10">
                        Service
                      </th>
                      {jours.map((j) => {
                        const d = new Date(`${j}T12:00:00Z`);
                        const estAujourdhui = j === jourJ;
                        return (
                          <th
                            key={j}
                            scope="col"
                            className={`min-w-28 border-b border-l border-black/10 px-2 py-1.5 text-center dark:border-white/10 ${
                              estAujourdhui ? "bg-amber-100 dark:bg-amber-500/20" : ""
                            }`}
                          >
                            <span className="block text-[10px] capitalize text-neutral-500">
                              {JOURS_COURT[d.getUTCDay()]}
                            </span>
                            <span className="font-mono text-sm font-semibold">
                              {j.slice(8, 10)}/{j.slice(5, 7)}
                            </span>
                            {estAujourdhui && (
                              <span className="block text-[9px] font-medium uppercase text-amber-700 dark:text-amber-400">
                                aujourd&apos;hui
                              </span>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {servicesSemaine.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-6 text-center text-neutral-500">
                          Aucune affectation cette semaine.
                        </td>
                      </tr>
                    ) : (
                      servicesSemaine.map((sid) => (
                        <tr key={sid || "autres"} className="align-top">
                          <th scope="row" className="border-t border-black/10 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-neutral-600 dark:border-white/10 dark:text-neutral-300">
                            {nomService(sid)}
                          </th>
                          {jours.map((j) => {
                            const entrees = cellule.get(`${sid}|${j}`) ?? [];
                            const horsPeriode = j < planning.du || j > planning.au;
                            return (
                              <td
                                key={j}
                                className={`border-l border-t border-black/10 px-1 py-1 dark:border-white/10 ${
                                  j === jourJ
                                    ? "bg-amber-50 dark:bg-amber-500/10"
                                    : horsPeriode
                                      ? "bg-black/[0.03] dark:bg-white/[0.03]"
                                      : ""
                                }`}
                              >
                                <ul className="space-y-0.5">
                                  {entrees.map((e, i) => (
                                    <li
                                      key={i}
                                      className={`rounded-r border-l-2 bg-black/[0.03] px-1 py-0.5 dark:bg-white/[0.05] ${BORDURE[e.type] ?? "border-l-neutral-400"} ${e.repos ? "text-neutral-500" : ""}`}
                                    >
                                      <span className="block truncate font-medium">{e.agent}</span>
                                      <span className="block truncate font-mono text-[9px] text-neutral-500">
                                        {e.repos ? e.motif : e.heures}
                                        {e.lieu ? ` · ${e.lieu}` : ""}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <footer className="mt-8 border-t border-black/10 pt-3 text-[10px] text-neutral-500 dark:border-white/10">
        <p>
          Le personnel est tenu de respecter le planning. Tout changement doit être validé par la
          Direction. Période couverte : {planning.du} → {planning.au}.
        </p>
        <p className="mt-0.5 print:hidden">
          Document consultable par lien privé — merci de ne pas le diffuser en dehors du personnel
          du centre.
        </p>
      </footer>
    </main>
  );
}
