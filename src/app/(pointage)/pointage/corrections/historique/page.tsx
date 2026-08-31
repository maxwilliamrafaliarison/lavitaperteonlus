import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, PencilLine, Plus } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { safe } from "@/lib/sheets/safe";
import { versHeures } from "@/lib/pointage/calcul";
import {
  listAgents, listAjustements, listHeuresSup, nomAffiche,
  type Agent, type Ajustement, type HeureSup,
} from "@/lib/pointage/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Historique des corrections" };

/* ============================================================
   HISTORIQUE DES CORRECTIONS
   ============================================================

   Corriger un pointage n'est plus réservé à l'administrateur : la
   responsable administration et la RH le font désormais, parce que c'est
   leur travail quotidien. Un pouvoir qui se partage a besoin d'une trace
   qui se consulte.

   ── LA TRACE EXISTAIT DÉJÀ, ELLE NE SE VOYAIT NULLE PART ─────────────────
   Chaque correction porte depuis toujours son motif, son auteur et son
   horodatage : c'est ce qui rend la paie défendable en cas de contestation.
   Mais rien ne les affichait, si bien que la garantie était théorique. Cet
   écran ne crée pas la traçabilité, il la rend consultable.

   ── POURQUOI CETTE LISTE EST FIDÈLE ──────────────────────────────────────
   Une correction s'enregistre sous l'identifiant `ADJ-{agent}-{jour}`, et
   ré-écrire ce même jour est REFUSÉ plutôt qu'accepté en écrasant. La table
   ne contient donc que des lignes jamais remplacées : la lire du plus
   récent au plus ancien donne l'historique complet, sans qu'il faille un
   journal séparé qui pourrait diverger de la réalité.

   Les deux gestes figurent ensemble, car c'est ensemble qu'on les relit :
   une correction d'horaire et des heures accordées le même jour au même
   agent se répondent.
   ============================================================ */

interface Entree {
  quand: string;
  auteur: string;
  agentNom: string;
  site: string;
  jour: string;
  nature: "correction" | "heures_sup";
  detail: string;
  motif: string;
}

const heureLisible = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  // Heure des centres (UTC+3), quel que soit le fuseau du serveur.
  return new Date(d.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " à ");
};

/** Ce qui a été écrit : les plages corrigées, ou le type d'absence. */
function detailAjustement(a: Ajustement): string {
  if (a.type_absence) return `Absence déclarée : ${a.type_absence}`;
  const plages = [
    a.matin_debut && a.matin_fin ? `${a.matin_debut}–${a.matin_fin}` : "",
    a.aprem_debut && a.aprem_fin ? `${a.aprem_debut}–${a.aprem_fin}` : "",
  ].filter(Boolean);
  return plages.length ? `Horaires retenus : ${plages.join("  ")}` : "Correction sans horaire";
}

export default async function HistoriqueCorrectionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "pointage:lire")) redirect("/pointage");

  const res = await safe<[Agent[], Ajustement[], HeureSup[]]>(
    () => Promise.all([listAgents(), listAjustements(), listHeuresSup()]),
    [[], [], []],
  );
  const [agents, ajustements, heuresSup] = res.data;
  const parId = new Map(agents.map((a) => [a.id, a]));
  const nomDe = (id: string) => {
    const a = parId.get(id);
    return a ? nomAffiche(a) : id;
  };
  const siteDe = (id: string) => parId.get(id)?.site ?? "";

  const entrees: Entree[] = [
    ...ajustements.map((a) => ({
      quand: a.timestamp,
      auteur: a.auteur_email,
      agentNom: nomDe(a.agent_id),
      site: siteDe(a.agent_id),
      jour: a.jour,
      nature: "correction" as const,
      detail: detailAjustement(a),
      motif: a.motif,
    })),
    ...heuresSup.map((h) => ({
      quand: h.timestamp,
      auteur: h.valide_par,
      agentNom: nomDe(h.agent_id),
      site: siteDe(h.agent_id),
      jour: h.jour,
      nature: "heures_sup" as const,
      detail: `${versHeures(h.minutes)} accordées`,
      motif: h.motif,
    })),
  ].sort((a, b) => b.quand.localeCompare(a.quand));

  const auteurs = new Map<string, number>();
  for (const e of entrees) auteurs.set(e.auteur, (auteurs.get(e.auteur) ?? 0) + 1);

  return (
    <main id="main-content" className="mx-auto max-w-6xl flex-1 p-4 md:p-8">
      <header>
        <Link
          href="/pointage/corrections"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Corrections
        </Link>
        <h1 className="mt-3 font-display text-xl font-semibold tracking-tight">
          Historique des corrections
        </h1>
        <p className="text-sm text-muted-foreground">
          Qui a corrigé quoi, quand, et pourquoi. Les pointages bruts des machines ne sont jamais
          modifiés : chaque ligne ci-dessous s&apos;est ajoutée par-dessus.
        </p>
      </header>

      <section className="mt-7 grid grid-cols-2 gap-x-6 gap-y-6 border-y border-glass-border py-5 md:grid-cols-4 md:divide-x md:divide-glass-border">
        <div className="md:pr-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Écritures
          </p>
          <p className="font-display text-2xl font-semibold tabular-nums tracking-[-0.02em]">
            {entrees.length}
          </p>
        </div>
        <div className="md:px-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Corrections
          </p>
          <p className="font-display text-2xl font-semibold tabular-nums tracking-[-0.02em]">
            {ajustements.length}
          </p>
        </div>
        <div className="md:px-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Heures accordées
          </p>
          <p className="font-display text-2xl font-semibold tabular-nums tracking-[-0.02em]">
            {heuresSup.length}
          </p>
        </div>
        <div className="md:pl-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Auteurs
          </p>
          <div className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
            {auteurs.size === 0 ? (
              <span>Aucun</span>
            ) : (
              [...auteurs].sort((a, b) => b[1] - a[1]).map(([e, n]) => (
                <span key={e} className="truncate">
                  {e.split("@")[0]}
                  <span className="ml-1.5 tabular-nums text-foreground">{n}</span>
                </span>
              ))
            )}
          </div>
        </div>
      </section>

      {!res.ok && (
        <p className="mt-4 text-sm text-[var(--danger)]">
          La base n&apos;a pas répondu : cette liste est peut-être incomplète. {res.error}
        </p>
      )}

      {entrees.length === 0 ? (
        <p className="mt-6 border-y border-glass-border py-12 text-center text-sm text-muted-foreground">
          Aucune correction enregistrée à ce jour. Les corrections faites depuis l&apos;écran
          précédent apparaîtront ici, la plus récente en tête.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-glass-border text-left">
                <Th className="w-40">Quand</Th>
                <Th className="w-44">Par</Th>
                <Th>Agent</Th>
                <Th className="w-24">Jour</Th>
                <Th>Ce qui a été fait</Th>
                <Th>Motif</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border">
              {entrees.map((e, i) => (
                <tr key={`${e.nature}-${e.agentNom}-${e.jour}-${i}`} className="align-top transition-colors hover:bg-foreground/[0.02]">
                  <td className="py-2.5 pr-4 font-mono text-xs tabular-nums text-muted-foreground">
                    {heureLisible(e.quand)}
                  </td>
                  <td className="py-2.5 pr-4 text-xs">{e.auteur || "—"}</td>
                  <td className="py-2.5 pr-4">
                    <span className="block truncate font-medium">{e.agentNom}</span>
                    {e.site ? (
                      <span className="block text-[11px] text-muted-foreground">{e.site}</span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-xs tabular-nums">{e.jour}</td>
                  <td className="py-2.5 pr-4">
                    <span className="inline-flex items-center gap-1.5">
                      {e.nature === "correction" ? (
                        <PencilLine className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <Plus className="size-3 shrink-0 text-[var(--warning)]" aria-hidden="true" />
                      )}
                      <span className="text-xs">{e.detail}</span>
                    </span>
                  </td>
                  <td className="py-2.5 text-xs text-muted-foreground">{e.motif || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-5 max-w-prose text-[11px] leading-relaxed text-muted-foreground">
        Une journée déjà corrigée ne peut pas l&apos;être une seconde fois : la deuxième tentative
        est refusée plutôt qu&apos;acceptée en écrasant la première. Cette liste est donc complète,
        et aucune correction n&apos;en a jamais disparu.
      </p>
    </main>
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
