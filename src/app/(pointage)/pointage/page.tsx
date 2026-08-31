import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { PanneBanner } from "@/components/layout/panne-banner";
import { BarreEmpilee, Mesure, Pastille } from "@/components/dashboard/micrographiques";
import { presenceDuJour, type PresenceAgent, type Agent, nomAffiche } from "@/lib/pointage/data";

import { BoutonCollecte, ImportMiaraka } from "./bouton-collecte";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pointage" };

/* ============================================================
   PRÉSENCE DU JOUR
   ============================================================

   ── CE QUE CET ÉCRAN A CESSÉ DE FAIRE ────────────────────────────────────
   Quatre cartes de la largeur du quart de page pour quatre nombres, un titre
   de trente-six pixels, deux blocs pour deux boutons : la page occupait un
   écran entier avant de montrer la moindre présence, qui est pourtant la
   seule chose qu'on vient y chercher.

   Les mesures tiennent maintenant sur UNE ligne, séparées par des filets.
   Un filet suffit à dire « ceci est un autre nombre » ; une carte le dit
   aussi, en prenant dix fois la place. La barre empilée sous les deux
   premières donne d'un coup d'œil le rapport présents / absents, que quatre
   nombres côte à côte obligeaient à calculer de tête.

   ── LES PASSAGES, ET NON PLUS « LE DERNIER » ─────────────────────────────
   La colonne ne montrait que l'heure du dernier badge. Or la question de la
   RH n'est pas « quand a-t-il badgé » mais « est-il arrivé à l'heure, et
   est-il sorti entre-temps ». La suite complète répond aux deux : entrées et
   sorties alternées, chacune sur sa pastille.

   Le sens n'est pas lu sur l'appareil, qui ne l'enregistre pas : il vient de
   l'ALTERNANCE, premier passage entrée, deuxième sortie. C'est la règle qui
   fonde déjà le calcul de présence, et l'écran ne fait que la rendre
   visible.
   ============================================================ */

/** Jour courant à Antananarivo (UTC+3), indépendant du fuseau du serveur. */
function aujourdhuiMada(): string {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function PointagePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:pointage")) redirect("/apps");
  const t = getT(session.user.lang);
  const jour = aujourdhuiMada();

  const res = await safe<{ presents: PresenceAgent[]; absents: Agent[]; parSite: Record<string, number> }>(
    () => presenceDuJour(jour),
    { presents: [], absents: [], parSite: {} },
  );

  const { presents, absents, parSite } = res.data;
  const effectif = presents.length + absents.length;
  const dateLisible = new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
  const part = effectif > 0 ? Math.round((presents.length / effectif) * 100) : 0;

  const tries = [...presents].sort(
    (a, b) => a.agent.nom.localeCompare(b.agent.nom) || a.agent.prenom.localeCompare(b.agent.prenom),
  );

  return (
    <main id="main-content" className="mx-auto max-w-6xl flex-1 p-4 md:p-8">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">{t("pointage.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("pointage.subtitle")}</p>
        </div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{dateLisible}</p>
      </header>

      {!res.ok ? (
        <div className="mt-6">
          <PanneBanner
            titre="Données de pointage indisponibles"
            consigne="La base ne répond pas. Les présences affichées seraient fausses : ne tirez aucune conclusion de cet écran tant qu'il n'est pas rétabli."
            detail={res.error}
          />
        </div>
      ) : (
        <>
          {/* Une ligne, quatre mesures, trois filets. */}
          <section className="mt-7 grid grid-cols-2 gap-x-6 gap-y-6 border-y border-glass-border py-5 md:grid-cols-4 md:divide-x md:divide-glass-border">
            <div className="md:pr-6">
              <Mesure
                etiquette={t("pointage.presents")}
                valeur={String(presents.length)}
                ton={presents.length > 0 ? "bon" : "neutre"}
                detail={effectif > 0 ? `${part} % de l'effectif` : undefined}
              >
                <BarreEmpilee
                  className="mt-1 mb-1.5"
                  segments={[
                    { valeur: presents.length, ton: "bon", libelle: t("pointage.presents") },
                    { valeur: absents.length, ton: "neutre", libelle: t("pointage.absents") },
                  ]}
                />
              </Mesure>
            </div>
            <div className="md:px-6">
              <Mesure etiquette={t("pointage.absents")} valeur={String(absents.length)} />
            </div>
            <div className="md:px-6">
              <Mesure etiquette={t("pointage.effectif")} valeur={String(effectif)} />
            </div>
            <div className="md:pl-6">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Par site
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {Object.entries(parSite).length === 0 ? (
                  <span className="text-muted-foreground">Aucun</span>
                ) : (
                  Object.entries(parSite).map(([site, n]) => (
                    <Pastille key={site} ton="bon">
                      {site}
                      <span className="ml-1.5 font-medium tabular-nums text-foreground">{n}</span>
                    </Pastille>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Collecte directe : réservée à qui gère le pointage. Un dispositif
              par centre, chaque pointeuse ayant sa propre numérotation. */}
          {can(session.user.role, "pointage:collecter") && (
            <section className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <BoutonCollecte site="REX" />
              <ImportMiaraka />
            </section>
          )}

          <section className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-sm font-semibold">{t("pointage.presents")}</h2>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <ArrowDownLeft className="size-3 text-[var(--success)]" aria-hidden="true" />
                  Entrée
                </span>
                <span className="inline-flex items-center gap-1">
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                  Sortie
                </span>
              </p>
            </div>

            {tries.length === 0 ? (
              <p className="mt-3 border-y border-glass-border py-10 text-center text-sm text-muted-foreground">
                {t("pointage.aucun_present")}
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-b border-glass-border text-left">
                      <Th>{t("pointage.col_agent")}</Th>
                      <Th className="w-20">{t("pointage.col_site")}</Th>
                      <Th>Passages du jour</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border">
                    {tries.map((p) => (
                      <tr key={p.agent.id} className="transition-colors hover:bg-foreground/[0.02]">
                        <td className="py-2.5 pr-4">
                          <span className="block truncate font-medium">{nomAffiche(p.agent)}</span>
                          {p.agent.poste ? (
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {p.agent.poste}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-4 text-xs text-muted-foreground">{p.site}</td>
                        <td className="py-2.5">
                          <SuitePassages passages={p.passages} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="mt-5 max-w-prose text-[11px] leading-relaxed text-muted-foreground">
            Un agent est considéré présent lorsqu&apos;il a badgé un nombre impair de fois
            aujourd&apos;hui, c&apos;est-à-dire entré sans être ressorti. Le sens de chaque passage
            se déduit de la même alternance : la pointeuse ne l&apos;enregistre pas. Les données
            proviennent des pointeuses des centres REX et MIARAKA.
          </p>
        </>
      )}
    </main>
  );
}

/**
 * La journée d'un agent, entrée par entrée.
 *
 * Le rang donne le sens : pair pour une entrée, impair pour une sortie. Une
 * pastille pleine et une flèche vers le bas pour arriver, une pastille sobre
 * et une flèche vers le haut pour partir. La forme dit donc la même chose que
 * la couleur, ce qui la rend lisible en noir et blanc comme au daltonisme.
 */
function SuitePassages({ passages }: { passages: string[] }) {
  if (passages.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {passages.map((heure, i) => {
        const entree = i % 2 === 0;
        return (
          <span
            key={`${heure}-${i}`}
            title={entree ? `Entrée à ${heure}` : `Sortie à ${heure}`}
            className={
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[11px] tabular-nums " +
              (entree
                ? "border-[var(--success)]/35 bg-[var(--success)]/10 text-[var(--success)]"
                : "border-glass-border text-muted-foreground")
            }
          >
            {entree ? (
              <ArrowDownLeft className="size-3 shrink-0" aria-hidden="true" />
            ) : (
              <ArrowUpRight className="size-3 shrink-0" aria-hidden="true" />
            )}
            {heure}
            <span className="sr-only">{entree ? " entrée" : " sortie"}</span>
          </span>
        );
      })}
    </span>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
