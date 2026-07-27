"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { BadgeStatut } from "@/components/pointage/badge-site";
import { cn } from "@/lib/utils";

import { affecterAction } from "./actions";

export interface CreneauOption {
  id: string;
  libelle: string;
  type: string;
  court: string; // étiquette compacte affichée dans la cellule
}

export interface AgentLigne {
  id: string;
  nom: string;
  statut: string;
}

export interface GrilleProps {
  planningId: string;
  jours: Array<{ date: string; num: string; abrege: string; weekend: boolean }>;
  agents: AgentLigne[];
  creneaux: CreneauOption[];
  /** clé "agentId|jour" → creneau_id */
  affectations: Record<string, string>;
}

/** Couleur de fond d'une cellule, par famille de créneau. */
function teinte(type: string | undefined): string {
  switch (type) {
    case "garde_nuit":
      return "bg-[oklch(0.62_0.19_300_/_0.14)] text-[oklch(0.55_0.2_300)] dark:text-[oklch(0.78_0.18_300)]";
    case "repos":
      return "bg-black/[0.04] text-muted-foreground dark:bg-white/[0.04]";
    case "fractionnee":
    case "journee":
      return "bg-[oklch(0.70_0.16_155_/_0.14)] text-[oklch(0.45_0.15_155)] dark:text-[oklch(0.78_0.15_155)]";
    case "demi":
      return "bg-[oklch(0.72_0.16_70_/_0.14)] text-[oklch(0.50_0.16_70)] dark:text-[oklch(0.82_0.15_70)]";
    default:
      return "";
  }
}

/**
 * Grille d'édition : agents en lignes, jours en colonnes.
 *
 * Chaque cellule est un <select> natif plutôt qu'un menu sur mesure : la
 * saisie au clavier fonctionne d'emblée, le rendu mobile est celui du
 * système, et un planning se remplit à la chaîne — la vitesse prime sur
 * l'esthétique du contrôle.
 */
export function GrillePlanning({ planningId, jours, agents, creneaux, affectations }: GrilleProps) {
  const router = useRouter();
  const [valeurs, setValeurs] = React.useState<Record<string, string>>(affectations);
  const [enCours, setEnCours] = React.useState<Set<string>>(new Set());
  const parId = React.useMemo(() => new Map(creneaux.map((c) => [c.id, c])), [creneaux]);

  async function changer(agentId: string, jour: string, creneauId: string) {
    const cle = `${agentId}|${jour}`;
    const precedent = valeurs[cle] ?? "";
    setValeurs((v) => ({ ...v, [cle]: creneauId }));
    setEnCours((s) => new Set(s).add(cle));
    try {
      const fd = new FormData();
      fd.set("planningId", planningId);
      fd.set("agentId", agentId);
      fd.set("jour", jour);
      fd.set("creneauId", creneauId);
      const r = await affecterAction(fd);
      if (!r.ok) {
        // Retour à l'état antérieur : laisser la cellule afficher une valeur
        // non enregistrée ferait croire à une saisie prise en compte.
        setValeurs((v) => ({ ...v, [cle]: precedent }));
        toast.error("Refusé", { description: r.error });
        return;
      }
      if (r.alertes.length) {
        toast.warning("Seuil légal dépassé", { description: r.alertes[0], duration: 8000 });
      }
      router.refresh();
    } finally {
      setEnCours((s) => {
        const n = new Set(s);
        n.delete(cle);
        return n;
      });
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-glass-border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-glass-border">
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-40 bg-[var(--background)] px-3 py-2 text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground"
            >
              Agent
            </th>
            {jours.map((j) => (
              <th
                key={j.date}
                scope="col"
                className={cn(
                  "min-w-24 px-1 py-2 text-center text-[10px] font-medium",
                  j.weekend ? "bg-black/[0.03] text-muted-foreground dark:bg-white/[0.03]" : "text-muted-foreground",
                )}
              >
                <span className="block capitalize">{j.abrege}</span>
                <span className="block font-mono text-[11px] text-foreground">{j.num}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-glass-border">
          {agents.map((a) => (
            <tr key={a.id}>
              <th
                scope="row"
                className="sticky left-0 z-10 bg-[var(--background)] px-3 py-1.5 text-left font-medium"
              >
                <span className="flex items-center gap-1.5">
                  <span className="truncate">{a.nom}</span>
                  <BadgeStatut statut={a.statut} />
                </span>
              </th>
              {jours.map((j) => {
                const cle = `${a.id}|${j.date}`;
                const val = valeurs[cle] ?? "";
                const c = parId.get(val);
                return (
                  <td key={j.date} className={cn("p-0.5", j.weekend && "bg-black/[0.03] dark:bg-white/[0.03]")}>
                    <select
                      value={val}
                      onChange={(e) => changer(a.id, j.date, e.target.value)}
                      disabled={enCours.has(cle)}
                      aria-label={`${a.nom}, ${j.abrege} ${j.num}`}
                      className={cn(
                        "w-full cursor-pointer rounded-md border-0 px-1 py-1 text-[11px] outline-none",
                        "focus:ring-2 focus:ring-accent/50 disabled:opacity-50",
                        teinte(c?.type),
                        !val && "text-muted-foreground",
                      )}
                    >
                      <option value="">—</option>
                      {creneaux.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.court}
                        </option>
                      ))}
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {agents.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Aucun agent actif rattaché à ce centre.
        </p>
      )}
    </div>
  );
}

/** Bandeau d'aide sur la lecture des couleurs. */
export function LegendeGrille() {
  const items = [
    { t: "journee", l: "Journée" },
    { t: "demi", l: "Demi-journée" },
    { t: "garde_nuit", l: "Garde / nuit" },
    { t: "repos", l: "Repos, congé" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <AlertTriangle className="size-3" aria-hidden="true" />
        Les seuils légaux sont vérifiés à chaque saisie.
      </span>
      {items.map((i) => (
        <span key={i.t} className="inline-flex items-center gap-1.5">
          <span className={cn("size-3 rounded", teinte(i.t))} aria-hidden="true" />
          {i.l}
        </span>
      ))}
    </div>
  );
}
