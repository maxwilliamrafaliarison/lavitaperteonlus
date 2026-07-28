import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { planningParToken, listAffectations, listCreneaux, listServices } from "@/lib/planning/data";
import { listAgents, type Agent } from "@/lib/pointage/data";
import { versHeures } from "@/lib/pointage/calcul";
import { dureeCreneau } from "@/lib/planning/creneau";
import { formaterDateHeure } from "@/lib/tz";

export const dynamic = "force-dynamic";

/* ============================================================
   PAGE PUBLIQUE DU PLANNING — consultable par lien secret
   ============================================================
   Hors authentification : le personnel consulte depuis son téléphone, sans
   compte. La protection tient au jeton (128 bits) et au noindex.

   ⚠️ MINIMISATION : cette page affiche QUI TRAVAILLE, jamais pourquoi
   quelqu'un est absent. Les motifs (congé, maladie, maternité) restent dans
   l'application authentifiée — les exposer reviendrait à publier des données
   de santé du personnel.
   ============================================================ */

export const metadata: Metadata = {
  title: "Planning",
  // Le lien est secret : il ne doit jamais entrer dans un index public.
  robots: { index: false, follow: false, nocache: true },
};

const JOURS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export default async function PlanningPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
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
  const parService = new Map(services.map((s) => [s.id, s]));
  const parAgent = new Map<string, Agent>(agents.map((a) => [a.id, a]));

  // Regroupement par jour, puis par agent.
  const jours = [...new Set(affectations.map((a) => a.jour))].sort();
  const parJour = new Map<string, typeof affectations>();
  for (const a of affectations) {
    parJour.set(a.jour, [...(parJour.get(a.jour) ?? []), a]);
  }

  const nomAgent = (id: string) => {
    const a = parAgent.get(id);
    if (!a) return id;
    return `${a.prenom} ${a.nom}`.trim() || id;
  };

  return (
    <main className="mx-auto min-h-dvh max-w-4xl px-4 py-8 print:max-w-none print:px-0">
      <header className="mb-6 border-b border-black/10 pb-4 dark:border-white/10">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          Centre {planning.centre} · La Vita Per Te
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          {planning.libelle || "Planning de travail"}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Du {planning.du} au {planning.au}
        </p>
        {planning.publie_le && (
          <p className="mt-2 text-xs text-neutral-500">
            Mis à jour le {formaterDateHeure(planning.publie_le)}
          </p>
        )}
      </header>

      {jours.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-500">
          Aucune affectation enregistrée pour cette période.
        </p>
      ) : (
        <div className="space-y-6">
          {jours.map((jour) => {
            const lignes = (parJour.get(jour) ?? []).sort((a, b) => {
              const ra = parService.get(a.service_id)?.rang ?? 999;
              const rb = parService.get(b.service_id)?.rang ?? 999;
              return ra - rb || nomAgent(a.agent_id).localeCompare(nomAgent(b.agent_id));
            });
            const d = new Date(`${jour}T12:00:00Z`);
            return (
              <section key={jour} className="break-inside-avoid">
                <h2 className="mb-2 text-sm font-semibold capitalize">
                  {JOURS_FR[d.getUTCDay()]} {jour.slice(8, 10)}/{jour.slice(5, 7)}
                </h2>
                <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-black/5 dark:divide-white/5">
                      {lignes.map((a) => {
                        const c = parCreneau.get(a.creneau_id);
                        const repos = c?.type === "repos";
                        return (
                          <tr key={a.id} className={repos ? "text-neutral-400" : ""}>
                            <td className="px-3 py-2 font-medium">{nomAgent(a.agent_id)}</td>
                            <td className="px-3 py-2 text-neutral-500">
                              {parService.get(a.service_id)?.libelle ?? ""}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs tabular-nums">
                              {repos
                                ? "—"
                                : a.debut && a.fin
                                  ? `${a.debut} → ${a.fin}`
                                  : c
                                    ? `${c.debut} → ${c.fin}`
                                    : ""}
                            </td>
                            <td className="px-3 py-2 text-xs text-neutral-500">{a.lieu}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-neutral-500">
                              {c && !repos ? versHeures(dureeCreneau(c)) : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <footer className="mt-10 border-t border-black/10 pt-4 text-xs text-neutral-500 dark:border-white/10">
        <p>
          Le personnel est tenu de respecter le planning. Tout changement doit être validé par la
          Direction.
        </p>
        <p className="mt-1 print:hidden">
          Document consultable par lien privé — merci de ne pas le diffuser en dehors du personnel
          du centre.
        </p>
      </footer>
    </main>
  );
}
