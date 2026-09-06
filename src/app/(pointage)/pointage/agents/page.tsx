import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import { listAgents, listHoraires, type Agent, type Horaire, nomAffiche } from "@/lib/pointage/data";

import { ListeAgents, type LigneAgent } from "./liste-agents";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fiches du personnel (Pointage)" };

export default async function AgentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:pointage")) redirect("/apps");
  const t = getT(session.user.lang);

  const [agentsRes, horairesRes] = await Promise.all([
    safe<Agent[]>(() => listAgents(), []),
    safe<Horaire[]>(() => listHoraires(), []),
  ]);
  const agents = agentsRes.data.filter((a) => a.actif);
  const libelleHoraire = new Map(horairesRes.data.map((h) => [h.id, h.libelle]));

  const parSite = agents.reduce<Record<string, number>>((acc, a) => {
    acc[a.site] = (acc[a.site] ?? 0) + 1;
    return acc;
  }, {});

  /* Le tableau est aplati ICI, côté serveur : le composant client reçoit des
     chaînes prêtes à lire, et n'a besoin ni des tables d'horaires ni des
     traductions. Ce qui traverse la frontière reste ce qui s'affiche. */
  const lignes: LigneAgent[] = agents.map((a) => ({
    id: a.id,
    nom: nomAffiche(a),
    site: a.site,
    statut: a.statut,
    statutLibelle:
      a.statut === "prestataire"
        ? t("pointage.statut_prestataire")
        : t("pointage.statut_salarie"),
    poste: a.poste,
    service: a.service,
    horaire: libelleHoraire.get(a.horaire_id) ?? a.horaire_id,
  }));

  return (
    <main id="main-content" className="mx-auto max-w-6xl flex-1 p-4 md:p-10 space-y-6">
      <div>
        <Link
          href="/pointage"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("pointage.title")}
        </Link>
        <h1 className="mt-3 font-display text-xl font-semibold tracking-tight">
          {t("pointage.nav_agents")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {agents.length} agents actifs ·{" "}
          {Object.entries(parSite).map(([s, n]) => `${s} ${n}`).join(" · ")}
        </p>
      </div>

      <ListeAgents
        agents={lignes}
        vide={t("pointage.agents_vide")}
        libelles={{ agent: t("pointage.col_agent"), site: t("pointage.col_site") }}
      />

      <p className="text-[11px] text-muted-foreground">
        Cliquez sur un nom pour ouvrir sa fiche : emploi du temps de la semaine, heures
        prévues et réalisées, anomalies de badgeage.
      </p>
    </main>
  );
}
