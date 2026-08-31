import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { GlassCard } from "@/components/glass/glass-card";
import { PanneBanner } from "@/components/layout/panne-banner";
import { Mesure } from "@/components/dashboard/micrographiques";
import { besoinsDeCouverture, type Couverture } from "@/lib/planning/remplacement-data";
import { aujourdhui } from "@/lib/tz";

import { CarteBesoin, type BesoinVue } from "./besoin-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Remplacements (Pointage)" };

/* ============================================================
   REMPLACEMENTS
   ============================================================

   ── LA QUESTION DU MATIN ─────────────────────────────────────────────────
   « Qui manque cette semaine, et qui peut le couvrir ». Elle se posait
   jusqu'ici en trois écrans : la grille pour voir les cases, les congés pour
   savoir qui est absent, et les fiches pour savoir qui est libre. Le
   croisement se faisait de tête, et il se ratait.

   Deux situations produisent le même besoin. Un poste OUVERT SANS TITULAIRE
   se voit à l'œil sur la grille. Un poste POURVU PAR QUELQU'UN QUI SERA
   ABSENT ne se voit pas du tout : la case est remplie, rien ne cloche, et on
   l'apprend le matin où personne n'arrive. C'est ce second cas qui justifie
   l'écran.

   ── LA FENÊTRE EST COURTE, ET C'EST VOULU ────────────────────────────────
   Quatorze jours par défaut. Un trou dans six semaines n'appelle aucune
   action aujourd'hui, et l'afficher ferait descendre sous la ligne de
   flottaison celui de demain. La période s'élargit à la demande, pour qui
   prépare de plus loin.
   ============================================================ */

const FENETRE_JOURS = 14;

function decaler(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function enClair(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
}

export default async function RemplacementsPage({
  searchParams,
}: {
  searchParams: Promise<{ jours?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "planning:gerer")) redirect("/pointage");
  const t = getT(session.user.lang);

  const sp = await searchParams;
  const demande = Number(sp.jours);
  const jours = [7, 14, 30, 90].includes(demande) ? demande : FENETRE_JOURS;

  const du = aujourdhui();
  const au = decaler(du, jours - 1);

  const res = await safe<Couverture>(() => besoinsDeCouverture(du, au), {
    besoins: [],
    absencesLisibles: true,
  });
  const besoins = res.data.besoins;

  const vues: BesoinVue[] = besoins.map((b) => ({
    affectationId: b.affectationId,
    planningId: b.planningId,
    planningLibelle: b.planningLibelle,
    planningPublie: b.planningPublie,
    jour: b.besoin.jour,
    jourLisible: enClair(b.besoin.jour),
    posteLibelle: b.besoin.posteLibelle,
    creneauLibelle: b.creneauLibelle,
    lieu: b.besoin.lieu,
    centre: b.besoin.centre,
    motif: b.besoin.motif,
    agentRemplaceNom: b.besoin.agentRemplaceNom,
    natureAbsence: b.besoin.natureAbsence,
    candidats: b.candidats,
  }));

  const vides = vues.filter((v) => v.motif === "poste_vide").length;
  const aRemplacer = vues.length - vides;
  const sansSolution = vues.filter((v) => !v.candidats.some((c) => c.disponible)).length;
  const cetteSemaine = vues.filter((v) => v.jour <= decaler(du, 6)).length;

  return (
    <main id="main-content" className="mx-auto max-w-4xl flex-1 p-4 md:p-10 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/pointage/planning"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("pointage.nav_planning_semaine")}
          </Link>
          <h1 className="mt-3 font-display text-xl font-semibold tracking-tight">
            {t("pointage.nav_remplacements")}
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Les postes que personne ne tient, et ceux dont le titulaire sera absent. Pour chacun,
            qui peut le prendre sans dépasser un seuil légal.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Étendue de la période">
          {[
            { v: 7, l: "7 jours" },
            { v: 14, l: "14 jours" },
            { v: 30, l: "30 jours" },
          ].map((f) => (
            <Link
              key={f.v}
              href={`/pointage/planning/remplacements?jours=${f.v}`}
              aria-current={jours === f.v ? "page" : undefined}
              className={
                jours === f.v
                  ? "rounded-xl border border-accent/40 bg-accent/12 px-3 py-1.5 text-sm text-accent"
                  : "rounded-xl border border-glass-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/5"
              }
            >
              {f.l}
            </Link>
          ))}
        </nav>
      </div>

      {!res.ok ? (
        <PanneBanner
          titre="Remplacements indisponibles"
          consigne="La base ne répond pas. N'en concluez pas que la couverture est complète : un écran vide ne prouve rien tant qu'il n'est pas rétabli."
          detail={res.error}
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-x-6 gap-y-6 border-y border-glass-border py-5 md:grid-cols-4 md:divide-x md:divide-glass-border">
            <div className="md:pr-6">
              <Mesure
                etiquette="À couvrir"
                valeur={String(vues.length)}
                ton={vues.length > 0 ? "vigilance" : "bon"}
                detail={cetteSemaine > 0 ? `dont ${cetteSemaine} sous 7 jours` : undefined}
              />
            </div>
            <div className="md:px-6">
              <Mesure etiquette="Postes sans personne" valeur={String(vides)} />
            </div>
            <div className="md:px-6">
              <Mesure etiquette="Titulaire absent" valeur={String(aRemplacer)} />
            </div>
            <div className="md:pl-6">
              <Mesure
                etiquette="Sans solution"
                valeur={String(sansSolution)}
                ton={sansSolution > 0 ? "critique" : "neutre"}
                detail={sansSolution > 0 ? "personne n'est libre" : undefined}
              />
            </div>
          </section>

          {!res.data.absencesLisibles && (
            <PanneBanner
              titre="Les absences ne sont pas lues"
              consigne="Le module des congés ne répond pas, et la moitié des trous est donc invisible : un poste tenu par quelqu'un qui sera absent a l'air pourvu. Ne concluez rien de cet écran tant qu'il n'est pas rétabli."
              detail="Vérifiez que la migration 023 est appliquée."
            />
          )}

          {vues.length === 0 ? (
            <GlassCard className="p-10 text-center">
              <ShieldCheck className="mx-auto size-8 text-[var(--success)]" aria-hidden="true" />
              <p className="mt-3 text-sm">
                {res.data.absencesLisibles
                  ? `Rien à couvrir sur ${jours} jours : chaque poste planifié a quelqu'un, et personne d'affecté n'est en congé.`
                  : `Aucun poste ouvert sans titulaire sur ${jours} jours. Les absences, elles, n'ont pas pu être lues.`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Du {enClair(du)} au {enClair(au)}.
              </p>
            </GlassCard>
          ) : (
            <div className="space-y-4">
              {vues.map((v) => (
                <CarteBesoin key={v.affectationId} b={v} />
              ))}
            </div>
          )}

          <div className="flex items-start gap-2 rounded-xl border border-glass-border bg-white/3 px-4 py-3 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            <span className="text-muted-foreground">
              L&apos;ordre proposé n&apos;est pas un classement de mérite : d&apos;abord qui est
              libre, puis qui connaît déjà le poste d&apos;après les plannings passés, puis qui a la
              semaine la plus légère. Le contrôle des repos et du plafond hebdomadaire est fait
              avec le poste EN PLUS, pas sans lui. Confier un poste sur un planning déjà publié
              prévient automatiquement les responsables.
            </span>
          </div>
        </>
      )}
    </main>
  );
}
