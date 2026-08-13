"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { affecterAction } from "./actions";
import type { CreneauOption, AgentLigne } from "./grille";

/* ============================================================
   PLANNING — vue en barres, inspirée des outils de gestion de chantier
   ============================================================
   Une grille de menus déroulants se lit mal : l'œil doit ouvrir chaque
   cellule pour savoir qui travaille quand. Ici chaque affectation est une
   BARRE COLORÉE posée sur la journée, si bien qu'une semaine se lit d'un
   regard — les trous, les gardes de nuit, les repos.

   L'édition reste accessible : un clic sur une cellule ouvre le choix du
   créneau, sans quitter la grille.
   ============================================================ */

export interface FamilleCreneau {
  type: string;
  libelle: string;
  classe: string;
}

/** Palette par famille — un code couleur stable, expliqué par la légende. */
export const FAMILLES: FamilleCreneau[] = [
  { type: "journee", libelle: "Journée continue", classe: "bg-[oklch(0.70_0.16_155)] text-white" },
  { type: "fractionnee", libelle: "Journée coupée", classe: "bg-[oklch(0.62_0.15_200)] text-white" },
  { type: "demi", libelle: "Demi-journée", classe: "bg-[oklch(0.75_0.15_70)] text-[oklch(0.25_0.05_70)]" },
  { type: "garde_nuit", libelle: "Garde / nuit", classe: "bg-[oklch(0.55_0.20_300)] text-white" },
  { type: "astreinte", libelle: "Astreinte", classe: "bg-[oklch(0.60_0.12_260)] text-white" },
  { type: "repos", libelle: "Repos, congé, férié", classe: "bg-[oklch(0.85_0_0)] text-[oklch(0.45_0_0)] dark:bg-[oklch(0.32_0_0)] dark:text-[oklch(0.70_0_0)]" },
];

export const classeDe = (type?: string) =>
  FAMILLES.find((f) => f.type === type)?.classe ?? "bg-[oklch(0.75_0_0)] text-[oklch(0.30_0_0)]";

export interface GanttProps {
  planningId: string;
  jours: Array<{ date: string; num: string; abrege: string; weekend: boolean }>;
  groupes: Array<{ service: string; libelle: string; agents: AgentLigne[] }>;
  creneaux: CreneauOption[];
  affectations: Record<string, { creneauId: string; debut: string; fin: string; lieu: string }>;
  editable: boolean;
  /**
   * Densité d'affichage. Sur six mois, 183 colonnes ne peuvent pas porter le
   * même détail qu'une semaine : les barres se réduisent à leur couleur, et
   * l'en-tête ne garde que le numéro de jour. Mieux vaut une vue d'ensemble
   * lisible qu'un texte illisible répété 183 fois.
   */
  densite?: "large" | "compacte" | "minimale";
}

export function PlanningGantt({
  planningId, jours, groupes, creneaux, affectations, editable, densite = "large",
}: GanttProps) {
  const compact = densite !== "large";
  const mini = densite === "minimale";
  const router = useRouter();
  const [valeurs, setValeurs] = React.useState(affectations);
  const [edition, setEdition] = React.useState<{ agentId: string; jour: string; service: string } | null>(null);
  const [enCours, setEnCours] = React.useState("");
  const parId = React.useMemo(() => new Map(creneaux.map((c) => [c.id, c])), [creneaux]);

  async function affecter(agentId: string, jour: string, service: string, creneauId: string) {
    const cle = `${agentId}|${jour}`;
    const avant = valeurs[cle];
    setEnCours(cle);
    setEdition(null);
    const c = parId.get(creneauId);
    setValeurs((v) => ({
      ...v,
      [cle]: creneauId ? { creneauId, debut: c?.debut ?? "", fin: c?.fin ?? "", lieu: "" } : undefined!,
    }));
    try {
      const fd = new FormData();
      fd.set("planningId", planningId);
      fd.set("agentId", agentId);
      fd.set("jour", jour);
      fd.set("creneauId", creneauId);
      fd.set("serviceId", service);
      const r = await affecterAction(fd);
      if (!r.ok) {
        setValeurs((v) => ({ ...v, [cle]: avant }));
        toast.error("Refusé", { description: r.error });
      } else {
        if (r.alertes?.length) toast.warning("Seuil légal dépassé", { description: r.alertes[0], duration: 8000 });
        router.refresh();
      }
    } finally {
      setEnCours("");
    }
  }

  return (
    <div className="space-y-3">
      <Legende />

      <div className="overflow-x-auto rounded-xl border border-glass-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-glass-border bg-black/[0.03] dark:bg-white/[0.03]">
              <th scope="col" className="sticky left-0 z-20 min-w-52 bg-[var(--background)] px-3 py-2 text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Personnel
              </th>
              {jours.map((j) => (
                <th
                  key={j.date}
                  scope="col"
                  className={cn(
                    "border-l border-glass-border py-1.5 text-center",
                    mini ? "min-w-[1.15rem] px-0" : compact ? "min-w-[2.1rem] px-0.5" : "min-w-[4.5rem] px-1",
                    j.weekend && "bg-black/[0.04] dark:bg-white/[0.04]",
                  )}
                >
                  {!mini && (
                    <span className="block text-[10px] capitalize text-muted-foreground">
                      {compact ? j.abrege.slice(0, 1) : j.abrege}
                    </span>
                  )}
                  <span className={cn("block font-mono font-medium", mini ? "text-[9px]" : "text-sm")}>
                    {j.num}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          {groupes.map((g) => (
            <tbody key={g.service} className="border-b border-glass-border last:border-0">
              {/* Bandeau de service, à la manière d'un regroupement par chantier. */}
              <tr>
                <th
                  colSpan={jours.length + 1}
                  scope="colgroup"
                  className="sticky left-0 bg-accent/[0.07] px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-accent"
                >
                  {g.libelle} · {g.agents.length}
                </th>
              </tr>
              {g.agents.map((a) => (
                <tr key={`${g.service}-${a.id}`} className="border-t border-glass-border/60">
                  <th scope="row" className="sticky left-0 z-10 bg-[var(--background)] px-3 py-1.5 text-left font-normal">
                    <Link href={`/pointage/agents/${a.id}`} className="block truncate font-medium hover:text-accent transition-colors">
                      {a.nom}
                    </Link>
                    {a.statut === "prestataire" && (
                      <span className="text-[10px] text-muted-foreground">Prestataire</span>
                    )}
                  </th>
                  {jours.map((j) => {
                    const cle = `${a.id}|${j.date}`;
                    const v = valeurs[cle];
                    const c = v ? parId.get(v.creneauId) : undefined;
                    const ouvert = edition?.agentId === a.id && edition?.jour === j.date;
                    return (
                      <td
                        key={j.date}
                        className={cn(
                          "relative border-l border-glass-border p-0.5 align-middle",
                          j.weekend && "bg-black/[0.02] dark:bg-white/[0.02]",
                        )}
                      >
                        {enCours === cle ? (
                          <span className="flex h-7 items-center justify-center">
                            <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden="true" />
                          </span>
                        ) : c ? (
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => setEdition({ agentId: a.id, jour: j.date, service: g.service })}
                            title={`${a.nom} · ${j.abrege} ${j.num} · ${c.libelle}${v?.lieu ? ` · ${v.lieu}` : ""}`}
                            className={cn(
                              "flex w-full items-center justify-center rounded font-medium leading-none",
                              mini ? "h-5" : compact ? "h-6" : "h-7 px-1 text-[10px]",
                              classeDe(c.type),
                              editable && "cursor-pointer hover:brightness-110",
                            )}
                          >
                            {compact ? "" : c.type === "repos" ? "—" : (v?.debut || c.debut || "").slice(0, 5)}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => setEdition({ agentId: a.id, jour: j.date, service: g.service })}
                            aria-label={`Affecter ${a.nom} le ${j.abrege} ${j.num}`}
                            className={cn(
                              "w-full rounded text-muted-foreground/40",
                              mini ? "h-5" : compact ? "h-6" : "h-7",
                              editable && "hover:bg-accent/10 hover:text-accent",
                            )}
                          >
                            {editable && !compact ? <Pencil className="mx-auto size-3" aria-hidden="true" /> : ""}
                          </button>
                        )}

                        {ouvert && (
                          <ChoixCreneau
                            creneaux={creneaux}
                            actuel={v?.creneauId ?? ""}
                            onChoisir={(id) => affecter(a.id, j.date, g.service, id)}
                            onFermer={() => setEdition(null)}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
          <LigneCouverture jours={jours} groupes={groupes} valeurs={valeurs} parId={parId} compact={compact} />
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   COUVERTURE — la seule ligne qui réponde à la vraie question
   ============================================================
   Un responsable qui ouvre un planning ne se demande pas « qui travaille ? »
   mais « est-ce que c'est couvert ? ». La grille répond à la première
   question, ligne par ligne ; il faut la lire en entier pour répondre à la
   seconde.

   On ne compare PAS à un effectif cible : le centre n'en a jamais écrit un,
   et l'inventer ferait afficher des « sous-effectif » qui ne veulent rien
   dire. On compare le jour AUX AUTRES JOURS DU MÊME SERVICE sur la période
   affichée : un service tenu tous les jours sauf un, c'est un trou, et
   c'est un fait, pas une norme supposée.
   ============================================================ */
function LigneCouverture({
  jours, groupes, valeurs, parId, compact,
}: {
  jours: GanttProps["jours"];
  groupes: GanttProps["groupes"];
  valeurs: GanttProps["affectations"];
  parId: Map<string, CreneauOption>;
  compact: boolean;
}) {
  /** Personnes réellement en poste : un repos ou un congé ne couvre rien. */
  const enPoste = (agentId: string, jour: string) => {
    const v = valeurs[`${agentId}|${jour}`];
    if (!v) return false;
    return parId.get(v.creneauId)?.type !== "repos";
  };

  const parJour = jours.map((j) => {
    const total = groupes.reduce(
      (n, g) => n + g.agents.filter((a) => enPoste(a.id, j.date)).length,
      0,
    );
    // Un service qui tourne les autres jours et personne aujourd'hui : un trou.
    const trous = groupes.filter((g) => {
      const aujourdhui = g.agents.some((a) => enPoste(a.id, j.date));
      const ailleurs = jours.some(
        (k) => k.date !== j.date && g.agents.some((a) => enPoste(a.id, k.date)),
      );
      return !aujourdhui && ailleurs;
    });
    return { jour: j, total, trous };
  });

  return (
    <tfoot>
      <tr className="border-t-2 border-glass-border">
        <th
          scope="row"
          className="sticky left-0 z-10 bg-[var(--background)] px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
        >
          Couverture
        </th>
        {parJour.map(({ jour, total, trous }) => (
          <td
            key={jour.date}
            className={cn(
              "border-l border-glass-border px-0.5 py-2 text-center align-middle",
              jour.weekend && "bg-black/[0.02] dark:bg-white/[0.02]",
            )}
            title={
              trous.length
                ? `${total} en poste · sans personne : ${trous.map((t) => t.libelle).join(", ")}`
                : `${total} en poste`
            }
          >
            <span className="block text-xs font-medium tabular-nums">{total}</span>
            {trous.length > 0 && (
              /* Le signe double la couleur : la grille finit photocopiée. */
              <span className="block text-[10px] font-medium text-[var(--warning)]">
                <span aria-hidden="true">▽</span>
                {compact ? "" : ` ${trous.length}`}
              </span>
            )}
          </td>
        ))}
      </tr>
    </tfoot>
  );
}

/** Légende des couleurs — sans elle, le code couleur est une devinette. */
function Legende() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
      {FAMILLES.map((f) => (
        <span key={f.type} className="inline-flex items-center gap-1.5">
          <span className={cn("size-3 rounded", f.classe)} aria-hidden="true" />
          <span className="text-muted-foreground">{f.libelle}</span>
        </span>
      ))}
    </div>
  );
}

/** Sélecteur flottant, ouvert au clic sur une cellule. */
function ChoixCreneau({
  creneaux, actuel, onChoisir, onFermer,
}: {
  creneaux: CreneauOption[];
  actuel: string;
  onChoisir: (id: string) => void;
  onFermer: () => void;
}) {
  return (
    <>
      <button type="button" className="fixed inset-0 z-30 cursor-default" onClick={onFermer} aria-label="Fermer" />
      <div className="absolute left-1/2 top-full z-40 mt-1 max-h-72 w-64 -translate-x-1/2 overflow-y-auto rounded-xl border border-glass-border bg-[var(--background)] p-1 shadow-xl">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Créneau</span>
          <button type="button" onClick={onFermer} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onChoisir("")}
          className={cn("block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-white/10", !actuel && "text-accent")}
        >
          — retirer l&apos;affectation
        </button>
        {FAMILLES.map((f) => {
          const items = creneaux.filter((c) => c.type === f.type);
          if (!items.length) return null;
          return (
            <div key={f.type}>
              <p className="mt-1 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{f.libelle}</p>
              {items.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onChoisir(c.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-white/10",
                    c.id === actuel && "text-accent",
                  )}
                >
                  <span className={cn("size-2.5 shrink-0 rounded", f.classe)} aria-hidden="true" />
                  <span className="truncate">{c.court}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
