import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, MapPin, Printer } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { GlassCard } from "@/components/glass/glass-card";
import { PanneBanner } from "@/components/layout/panne-banner";
import { safe } from "@/lib/sheets/safe";
import { nomAffiche } from "@/lib/pointage/data";
import { HABILLAGE, type EtatJour } from "@/lib/pointage/ecarts";
import { ecartsDuJourTousAgents, type EcartsAgentJour } from "@/lib/pointage/ecarts-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Écarts au planning" };

/** Jour courant à Antananarivo (UTC+3), indépendant du fuseau du serveur. */
function aujourdhuiMada(): string {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}
function decaler(jour: string, jours: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

/* Le rouge ne porte jamais l'information seul : la page est imprimée en noir
   et blanc et affichée au mur, et un homme sur douze distingue mal le rouge
   du vert. Chaque état porte donc un SIGNE et un MOT, la couleur en plus. */
const TON: Record<string, { texte: string; fond: string; bord: string }> = {
  alerte: { texte: "text-[var(--danger)]", fond: "bg-[var(--danger)]/10", bord: "border-[var(--danger)]/35" },
  attention: { texte: "text-[var(--warning)]", fond: "bg-[var(--warning)]/10", bord: "border-[var(--warning)]/35" },
  neutre: { texte: "text-muted-foreground", fond: "bg-foreground/5", bord: "border-glass-border" },
};

function Pastille({ etat }: { etat: EtatJour }) {
  const h = HABILLAGE[etat];
  const ton = TON[h.ton] ?? TON.neutre;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${ton.fond} ${ton.bord} ${ton.texte}`}
    >
      <span aria-hidden="true" className="font-mono">{h.signe}</span>
      {h.mot}
    </span>
  );
}

const mn = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`);

export default async function EcartsPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:pointage")) redirect("/apps");

  const params = await searchParams;
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(params.jour ?? "") ? params.jour! : aujourdhuiMada();

  const res = await safe<EcartsAgentJour[]>(() => ecartsDuJourTousAgents(jour), []);
  const lignes = res.data;

  /* GESTION PAR EXCEPTION. Une journée conforme n'a rien à dire : la faire
     défiler noierait les quatre lignes qui comptent sous cinquante qui ne
     comptent pas. Elles restent accessibles, repliées. */
  /* « Au travail » et « prend son poste plus tard » ne sont pas des écarts :
     ce sont les états normaux d'une journée qui n'est pas finie. Les laisser
     dans la file ferait clignoter trente alertes chaque matin. */
  const CALME = new Set(["conforme", "repos", "en_cours", "a_venir"]);
  const aTraiter = lignes.filter((l) => !CALME.has(l.ecarts.etat));
  const enCours = lignes.filter((l) => l.ecarts.etat === "en_cours" || l.ecarts.etat === "a_venir");
  const conformes = lignes.filter((l) => l.ecarts.etat === "conforme");
  const repos = lignes.filter((l) => l.ecarts.etat === "repos");

  const compte = (e: EtatJour) => aTraiter.filter((l) => l.ecarts.etat === e).length;
  const dateLisible = new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

  return (
    <main id="main-content" className="mx-auto max-w-6xl flex-1 p-4 md:p-10 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{dateLisible}</p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl font-semibold tracking-tight">
            Écarts au planning
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ce qui s'écarte du créneau prévu, et rien d'autre. Les journées conformes sont repliées en bas.
          </p>
        </div>
        <nav className="flex items-center gap-1 print:hidden" aria-label="Changer de jour">
          <Lien href={`/pointage/ecarts?jour=${decaler(jour, -1)}`} titre="Jour précédent">
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Lien>
          <Lien href="/pointage/ecarts">Aujourd'hui</Lien>
          <Lien href={`/pointage/ecarts?jour=${decaler(jour, 1)}`} titre="Jour suivant">
            <ChevronRight className="size-4" aria-hidden="true" />
          </Lien>
        </nav>
      </div>

      {!res.ok ? (
        <PanneBanner
          titre="Écarts indisponibles"
          consigne="La base ne répond pas. Ne tirez aucune conclusion de cet écran tant qu'il n'est pas rétabli : une absence d'écart affichée ne prouverait rien."
          detail={res.error}
        />
      ) : (
        <>
          {/* Le compteur qui descend vers zéro : ce qu'il reste à traiter. */}
          <GlassCard className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums">{aTraiter.length}</p>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">à regarder</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["retard_et_sortie", "retard", "sortie_anticipee", "a_verifier", "sans_badge", "hors_planning"] as EtatJour[])
                .filter((e) => compte(e) > 0)
                .map((e) => (
                  <span key={e} className="inline-flex items-center gap-1.5">
                    <Pastille etat={e} />
                    <span className="text-sm font-medium tabular-nums">{compte(e)}</span>
                  </span>
                ))}
              {aTraiter.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  Aucun écart : tout le monde était là quand le planning le prévoyait.
                </span>
              )}
            </div>
            <p className="ml-auto text-xs text-muted-foreground print:hidden">
              <Printer className="mr-1 inline size-3.5" aria-hidden="true" />
              Imprimable : les signes ▲ ▼ ◆ ! restent lisibles en noir et blanc.
            </p>
          </GlassCard>

          {aTraiter.length > 0 && (
            <GlassCard className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-glass-border text-left">
                      <Th>Agent</Th>
                      <Th>Prévu</Th>
                      <Th>Badgé</Th>
                      <Th className="text-right">Écart</Th>
                      <Th>Site</Th>
                      <Th>Ce qui s'est passé</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border">
                    {aTraiter.map(({ agent, ecarts, creneauLibelle }) => (
                      <tr key={agent.id} className="align-top">
                        <td className="px-4 py-3">
                          <Pastille etat={ecarts.etat} />
                          <p className="mt-1 font-medium leading-tight">{nomAffiche(agent)}</p>
                          {agent.poste ? (
                            <p className="text-[11px] text-muted-foreground">{agent.poste}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                          {creneauLibelle || "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">
                          {ecarts.debutRetenu ? `${ecarts.debutRetenu} → ${ecarts.finRetenue || "?"}` : "—"}
                          {ecarts.minutesNuit > 0 && (
                            <span className="block text-[11px] text-muted-foreground">
                              dont {mn(ecarts.minutesNuit)} de nuit
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                          {ecarts.retardMinutes > 0 && (
                            <span className={`block ${ecarts.etat === "a_verifier" ? "text-muted-foreground" : "text-[var(--danger)]"}`}>
                              <span aria-hidden="true">▲</span> {mn(ecarts.retardMinutes)}
                            </span>
                          )}
                          {ecarts.departAnticipeMinutes > 0 && (
                            <span className={`block ${ecarts.etat === "a_verifier" ? "text-muted-foreground" : "text-[var(--danger)]"}`}>
                              <span aria-hidden="true">▼</span> {mn(ecarts.departAnticipeMinutes)}
                            </span>
                          )}
                          {ecarts.avanceIgnoreeMinutes > 0 && (
                            <span className="block text-[11px] text-muted-foreground">
                              avance non comptée {mn(ecarts.avanceIgnoreeMinutes)}
                            </span>
                          )}
                          {ecarts.retardMinutes === 0 && ecarts.departAnticipeMinutes === 0 && "—"}
                        </td>
                        <td className="px-4 py-3">
                          {ecarts.sitesBadges.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 text-xs ${
                                ecarts.siteConforme === false ? "text-[var(--warning)] font-medium" : "text-muted-foreground"
                              }`}
                            >
                              <MapPin className="size-3" aria-hidden="true" />
                              {ecarts.sitesBadges.join(" + ")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {ecarts.motifs.map((m, i) => (
                            <p key={i} className={i > 0 ? "mt-1" : ""}>{m}</p>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {/* Repliées : présentes pour qui les cherche, absentes pour qui travaille. */}
          {enCours.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <span aria-hidden="true" className="font-mono">→</span> {enCours.filter((l) => l.ecarts.etat === "en_cours").length} au
              travail en ce moment · {enCours.filter((l) => l.ecarts.etat === "a_venir").length} prennent leur poste plus tard.
              La journée n'est pas finie : ces lignes ne sont pas des écarts.
            </p>
          )}

          {(conformes.length > 0 || repos.length > 0) && (
            <details className="rounded-2xl glass border px-5 py-3">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                {conformes.length} journée{conformes.length > 1 ? "s" : ""} conforme
                {conformes.length > 1 ? "s" : ""}
                {enCours.length > 0 && ` · ${enCours.length} en cours`}
                {repos.length > 0 && ` · ${repos.length} en repos`}
              </summary>
              <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {[...conformes, ...enCours, ...repos].map(({ agent, ecarts, creneauLibelle }) => (
                  <li key={agent.id} className="flex items-baseline gap-2">
                    <span aria-hidden="true" className="font-mono text-xs text-muted-foreground">
                      {HABILLAGE[ecarts.etat].signe}
                    </span>
                    <span className="truncate">{nomAffiche(agent)}</span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                      {ecarts.etat === "repos" ? "repos" : creneauLibelle}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* La légende voyage avec la feuille imprimée : sans elle, les
              signes ne veulent plus rien dire une fois punaisés au mur. */}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <strong>Lecture.</strong> ▲ retard · ▼ sortie anticipée · ◆ les deux · ! écart trop large pour un
            simple retard, un passage manque probablement · ? aucun passage enregistré alors qu'un créneau
            était prévu · + a badgé sans créneau prévu · → au travail en ce moment. Les minutes d'un jour « à vérifier » sont affichées
            mais ne comptent dans aucun total tant qu'elles n'ont pas été tranchées.
          </p>
        </>
      )}
    </main>
  );
}

function Lien({ href, children, titre }: { href: string; children: React.ReactNode; titre?: string }) {
  return (
    <Link
      href={href}
      title={titre}
      className="inline-flex h-9 items-center gap-1 rounded-xl glass border px-3 text-sm hover:bg-foreground/5 transition-colors"
    >
      {children}
    </Link>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground ${className}`}>
      {children}
    </th>
  );
}
