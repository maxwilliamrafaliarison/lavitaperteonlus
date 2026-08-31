import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, PartyPopper, ShieldCheck } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { GlassCard } from "@/components/glass/glass-card";
import { PanneBanner } from "@/components/layout/panne-banner";
import { Mesure } from "@/components/dashboard/micrographiques";
import { listAgents, nomAffiche, type Agent } from "@/lib/pointage/data";
import { joursDePeriode, libelleNature } from "@/lib/pointage/absences";
import {
  listAbsences,
  listParametresPointage,
  moduleAbsencesInstalle,
  reglagesDe,
  soldesConges,
  type Absence,
  type SoldeAgent,
} from "@/lib/pointage/absences-data";
import { aujourdhui } from "@/lib/tz";

import { DeclarerAbsence, type PersonneAbsence } from "./declarer";
import { LigneAbsenceRow, EtatPastille, periodeEnClair, type LigneAbsence } from "./ligne-absence";
import { DroitConges } from "./droit-conges";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Congés et absences (Pointage)" };

/* ============================================================
   CONGÉS ET ABSENCES
   ============================================================

   ── L'ORDRE DES SECTIONS EST CELUI DES QUESTIONS ─────────────────────────
   On ouvre cet écran pour trois raisons, et une seule à la fois :
   « qui manque aujourd'hui », « qu'ai-je à trancher », « que se passe-t-il
   dans les jours qui viennent ». Elles se suivent donc dans cet ordre, la
   plus urgente en tête. L'historique ferme la marche : on ne le consulte
   qu'en cherchant quelque chose de précis.

   ── LE SOLDE VIT ICI, PAS SUR UN ÉCRAN À PART ────────────────────────────
   Un solde de congés ne se regarde jamais pour lui-même : on le regarde au
   moment d'accorder. Le mettre sur une page séparée obligerait à faire
   l'aller-retour à chaque décision, et la décision se prendrait sans lui.
   ============================================================ */

function moisCourantMada(): string {
  return aujourdhui().slice(0, 7);
}

export default async function AbsencesPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "pointage:absences")) redirect("/pointage");
  const peutAccorder = can(session.user.role, "pointage:absences-valider");
  const t = getT(session.user.lang);

  const sp = await searchParams;
  const mois = /^\d{4}-\d{2}$/.test(sp.mois ?? "") ? sp.mois! : moisCourantMada();
  const [an, m] = mois.split("-").map(Number);
  const du = `${mois}-01`;
  const au = `${mois}-${String(new Date(an, m, 0).getDate()).padStart(2, "0")}`;
  const jour = aujourdhui();

  /* Fenêtre élargie : le mois affiché, plus les trois mois qui suivent. Une
     absence posée pour octobre doit se voir dès septembre, sinon on la
     découvre le jour où elle commence, c'est-à-dire trop tard pour
     réorganiser quoi que ce soit. */
  const finFenetre = `${String(an + Math.floor((m + 3 - 1) / 12)).padStart(4, "0")}-${String(((m + 3 - 1) % 12) + 1).padStart(2, "0")}-28`;
  const debutFenetre = du < jour ? du : jour;

  const res = await safe<{
    absences: Absence[];
    agents: Agent[];
    soldes: SoldeAgent[];
    modeDecompte: string;
    installe: boolean;
  }>(
    async () => {
      const [installe, absences, agents, soldes, parametres] = await Promise.all([
        moduleAbsencesInstalle(),
        listAbsences(debutFenetre, finFenetre > au ? finFenetre : au),
        listAgents(),
        soldesConges(jour),
        listParametresPointage(),
      ]);
      return { installe, absences, agents, soldes, modeDecompte: reglagesDe(parametres).mode };
    },
    { absences: [], agents: [], soldes: [], modeDecompte: "calendaire", installe: true },
  );

  const { absences, agents, soldes } = res.data;
  const parId = new Map(agents.map((a) => [a.id, a]));

  const enLigne = (a: Absence): LigneAbsence => {
    const agent = parId.get(a.agent_id);
    return {
      id: a.id,
      agentId: a.agent_id,
      agentNom: agent ? nomAffiche(agent) : a.agent_id,
      site: agent?.site ?? "",
      nature: a.nature,
      du: a.du,
      au: a.au,
      jours: joursDePeriode(a.du, a.au).length,
      joursDecomptes: Number(a.jours_decomptes) || 0,
      etat: a.etat,
      motif: a.motif,
      demandePar: a.demande_par,
      decidePar: a.decide_par,
      decisionNote: a.decision_note,
    };
  };

  const absentsAujourdhui = absences
    .filter((a) => a.etat === "acceptee" && a.du <= jour && jour <= a.au)
    .map(enLigne)
    .sort((x, y) => x.agentNom.localeCompare(y.agentNom));

  const aTrancher = absences
    .filter((a) => a.etat === "demande")
    .map(enLigne)
    .sort((x, y) => x.du.localeCompare(y.du));

  const aVenir = absences
    .filter((a) => a.etat === "acceptee" && a.au >= jour && a.du > jour)
    .map(enLigne)
    .sort((x, y) => x.du.localeCompare(y.du));

  const duMois = absences
    .filter((a) => a.du <= au && a.au >= du)
    .map(enLigne)
    .sort((x, y) => y.du.localeCompare(x.du));

  const personnes: PersonneAbsence[] = agents
    .filter((a) => a.actif)
    .map((a) => ({ id: a.id, nom: nomAffiche(a), site: a.site, poste: a.poste }))
    .sort((x, y) => x.nom.localeCompare(y.nom));

  /* Soldes triés par ce qui reste, du plus faible au plus élevé : celles
     qui approchent du bout de leur droit sont la seule raison de regarder
     ce tableau. Les personnes sans date d'entrée saisie ferment la marche,
     puisqu'aucun droit ne peut être calculé pour elles. */
  const soldesTries = [...soldes].sort((x, y) => {
    const sx = x.solde.acquis === 0 && x.solde.reporte === 0;
    const sy = y.solde.acquis === 0 && y.solde.reporte === 0;
    if (sx !== sy) return sx ? 1 : -1;
    return x.solde.restant - y.solde.restant;
  });
  const sansDroit = soldesTries.filter((s) => s.solde.acquis === 0 && s.solde.reporte === 0).length;

  return (
    <main id="main-content" className="mx-auto max-w-6xl flex-1 p-4 md:p-10 space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/pointage"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("pointage.title")}
          </Link>
          <h1 className="mt-3 font-display text-xl font-semibold tracking-tight">
            {t("pointage.nav_absences")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("pointage.abs_sous_titre")}</p>
        </div>
        {/* Le bouton disparaît quand la base ne répond pas ou que le module
            n'est pas installé : le laisser actif invite à saisir dans le
            vide, et la personne découvre l'échec après avoir tout tapé. */}
        {res.ok && res.data.installe && (
          <DeclarerAbsence personnes={personnes} peutAccorder={peutAccorder} aujourdHui={jour} />
        )}
      </div>

      {!res.ok ? (
        <PanneBanner
          titre="Absences indisponibles"
          consigne="La base ne répond pas. N'enregistrez rien depuis cet écran tant qu'il n'est pas rétabli : les déclarations seraient perdues."
          detail={res.error}
        />
      ) : !res.data.installe ? (
        <PanneBanner
          titre="Le module des congés n'est pas encore installé"
          consigne="La migration 023 doit être appliquée sur Supabase avant que cet écran puisse servir. Tant qu'elle ne l'est pas, rien de ce que vous saisiriez ici ne serait enregistré, et le pointage continue de signaler les journées d'absence comme des anomalies. Le reste de l'application fonctionne normalement."
          detail="Fichier à exécuter : supabase/migrations/023_pointage_absences.sql"
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-x-6 gap-y-6 border-y border-glass-border py-5 md:grid-cols-4 md:divide-x md:divide-glass-border">
            <div className="md:pr-6">
              <Mesure
                etiquette={t("pointage.abs_absents_aujourdhui")}
                valeur={String(absentsAujourdhui.length)}
                ton={absentsAujourdhui.length > 0 ? "vigilance" : "neutre"}
              />
            </div>
            <div className="md:px-6">
              <Mesure
                etiquette={t("pointage.abs_a_decider")}
                valeur={String(aTrancher.length)}
                ton={aTrancher.length > 0 ? "vigilance" : "neutre"}
              />
            </div>
            <div className="md:px-6">
              <Mesure etiquette="À venir" valeur={String(aVenir.length)} />
            </div>
            <div className="md:pl-6">
              <Mesure
                etiquette="Décompte"
                valeur={res.data.modeDecompte === "ouvre" ? "Ouvré" : "Calendaire"}
                detail={
                  res.data.modeDecompte === "ouvre"
                    ? "les jours non travaillés ne comptent pas"
                    : "dimanches compris, comme le prévoit la loi"
                }
              />
            </div>
          </section>

          {/* 1. QUI MANQUE MAINTENANT */}
          <Section titre={t("pointage.abs_absents_aujourdhui")} sousTitre={jourEnClair(jour)}>
            {absentsAujourdhui.length === 0 ? (
              <Vide>{t("pointage.abs_aucun_absent")}</Vide>
            ) : (
              <Tableau
                lignes={absentsAujourdhui}
                peutAccorder={peutAccorder}
                peutAnnuler={can(session.user.role, "pointage:absences")}
              />
            )}
          </Section>

          {/* 2. CE QU'IL Y A À TRANCHER */}
          {(aTrancher.length > 0 || peutAccorder) && (
            <Section
              titre={t("pointage.abs_a_decider")}
              sousTitre={
                peutAccorder
                  ? "Accorder retire les jours du solde et éteint les alertes de pointage"
                  : "Seule la direction peut trancher"
              }
            >
              {aTrancher.length === 0 ? (
                <Vide>{t("pointage.abs_aucune_demande")}</Vide>
              ) : (
                <Tableau lignes={aTrancher} peutAccorder={peutAccorder} peutAnnuler={false} />
              )}
            </Section>
          )}

          {/* 3. CE QUI ARRIVE */}
          {aVenir.length > 0 && (
            <Section
              titre={t("pointage.abs_en_cours")}
              sousTitre="Ces personnes ne doivent pas être affectées au planning sur ces dates"
            >
              <Tableau
                lignes={aVenir}
                peutAccorder={peutAccorder}
                peutAnnuler={can(session.user.role, "pointage:absences")}
              />
            </Section>
          )}

          {/* 4. LE SOLDE, LÀ OÙ LA DÉCISION SE PREND */}
          <Section
            titre={t("pointage.abs_soldes")}
            sousTitre={`Droit acquis sur l'exercice en cours, moins les congés pris${sansDroit > 0 ? ` · ${sansDroit} personne${sansDroit > 1 ? "s" : ""} sans date d'entrée saisie` : ""}`}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[38rem] text-sm">
                <thead>
                  <tr className="border-b border-glass-border text-left">
                    <Th>{t("pointage.col_agent")}</Th>
                    <Th className="text-right">Acquis</Th>
                    <Th className="text-right">Pris</Th>
                    <Th className="text-right">En attente</Th>
                    <Th className="text-right">{t("pointage.col_solde")}</Th>
                    <Th>Prochaine absence</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-glass-border">
                  {soldesTries.map((s) => {
                    const inconnu = s.solde.acquis === 0 && s.solde.reporte === 0;
                    return (
                      <tr key={s.agent.id} className="transition-colors hover:bg-foreground/[0.02]">
                        <td className="px-5 py-2.5">
                          <Link
                            href={`/pointage/agents/${s.agent.id}`}
                            className="block truncate font-medium transition-colors hover:text-accent focus-visible:underline focus-visible:outline-none"
                          >
                            {nomAffiche(s.agent)}
                          </Link>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {s.agent.site}
                          </span>
                        </td>
                        {inconnu ? (
                          <td colSpan={4} className="px-5 py-2.5">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] text-muted-foreground">
                                Date d&apos;entrée non renseignée : aucun droit ne peut être calculé.
                              </span>
                              {peutAccorder && (
                                <DroitConges
                                  agentId={s.agent.id}
                                  agentNom={nomAffiche(s.agent)}
                                  dateEntree={s.compteur.dateEntree}
                                  dateSortie={s.compteur.dateSortie}
                                  reporte={s.compteur.reporte}
                                />
                              )}
                            </span>
                          </td>
                        ) : (
                          <>
                            <td className="px-5 py-2.5 text-right tabular-nums">
                              {fmtJours(s.solde.acquis + s.solde.reporte)}
                            </td>
                            <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                              {fmtJours(s.solde.pris)}
                            </td>
                            <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                              {s.solde.enAttente > 0 ? fmtJours(s.solde.enAttente) : "—"}
                            </td>
                            <td
                              className={`px-5 py-2.5 text-right font-semibold tabular-nums ${
                                s.solde.restant < 0 ? "text-[var(--danger,#e5484d)]" : ""
                              }`}
                            >
                              {fmtJours(s.solde.restant)}
                            </td>
                          </>
                        )}
                        <td className="px-5 py-2.5 text-[11px] text-muted-foreground">
                          <span className="flex flex-wrap items-center gap-2">
                            {s.prochaine ? (
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                {libelleNature(s.prochaine.nature)}{" "}
                                {periodeEnClair(s.prochaine.du, s.prochaine.au)}
                                <EtatPastille etat={s.prochaine.etat} />
                              </span>
                            ) : (
                              <span>—</span>
                            )}
                            {!inconnu && peutAccorder && (
                              <DroitConges
                                agentId={s.agent.id}
                                agentNom={nomAffiche(s.agent)}
                                dateEntree={s.compteur.dateEntree}
                                dateSortie={s.compteur.dateSortie}
                                reporte={s.compteur.reporte}
                              />
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {/* 5. L'HISTORIQUE, QU'ON NE CONSULTE QU'EN CHERCHANT */}
          <Section
            titre={t("pointage.abs_historique")}
            sousTitre={`${duMois.length} absence${duMois.length > 1 ? "s" : ""} touchant le mois affiché`}
            action={
              <form className="flex items-end gap-2">
                <label className="block">
                  <span className="sr-only">{t("pointage.periode")}</span>
                  <input
                    type="month"
                    name="mois"
                    defaultValue={mois}
                    className="h-9 rounded-xl glass border px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </label>
                <button
                  type="submit"
                  className="h-9 rounded-xl border border-accent/40 bg-accent/12 px-3 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
                >
                  Afficher
                </button>
              </form>
            }
          >
            {duMois.length === 0 ? (
              <Vide>{t("pointage.abs_aucune")}</Vide>
            ) : (
              <Tableau
                lignes={duMois}
                peutAccorder={peutAccorder}
                peutAnnuler={can(session.user.role, "pointage:absences")}
              />
            )}
          </Section>

          <div className="flex flex-wrap items-start gap-2 rounded-xl border border-glass-border bg-white/3 px-4 py-3 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            <span className="text-muted-foreground">
              Une absence accordée éteint les alertes du pointage sur ces journées : la personne
              cesse d&apos;apparaître en « sans badge » dans les écarts, et ses retards ne sont plus
              comptés. Rien n&apos;est effacé pour autant, et une absence annulée reste au registre
              avec son auteur et sa date.{" "}
              <Link href="/pointage/absences/feries" className="inline-flex items-center gap-1 text-accent hover:underline">
                <PartyPopper className="size-3.5" aria-hidden="true" />
                Les jours fériés ne sont jamais décomptés
              </Link>
              .
            </span>
          </div>
        </>
      )}
    </main>
  );
}

/* ── Fragments ────────────────────────────────────────────────────────── */

function jourEnClair(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

/** « 2,5 » plutôt que « 2.5 » : le registre se lit en français. */
function fmtJours(n: number): string {
  return String(Math.round(n * 2) / 2).replace(".", ",");
}

function Section({
  titre,
  sousTitre,
  action,
  children,
}: {
  titre: string;
  sousTitre?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <GlassCard className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-glass-border px-5 py-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{titre}</h2>
          {sousTitre && <p className="mt-0.5 text-xs text-muted-foreground">{sousTitre}</p>}
        </div>
        {action}
      </div>
      {children}
    </GlassCard>
  );
}

function Vide({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

function Tableau({
  lignes,
  peutAccorder,
  peutAnnuler,
}: {
  lignes: LigneAbsence[];
  peutAccorder: boolean;
  peutAnnuler: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-glass-border text-left">
            <Th>Personne</Th>
            <Th>Nature</Th>
            <Th>Période</Th>
            <Th className="text-right">Jours</Th>
            <Th>État</Th>
            <Th className="text-right">Action</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-glass-border">
          {lignes.map((l) => (
            <LigneAbsenceRow key={l.id} l={l} peutAccorder={peutAccorder} peutAnnuler={peutAnnuler} />
          ))}
        </tbody>
      </table>
    </div>
  );
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
