"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";

import { ajouterPosteAttenteAction, attribuerPosteAction } from "./actions";
import type { CreneauOption } from "./grille";

/* ============================================================
   POSTES À POURVOIR
   ============================================================

   La ligne griffonnée en bas de la feuille Excel — « il faut quelqu'un
   samedi soir » — à laquelle on donne enfin un lieu dans l'application.

   Le geste réel de la DRH n'est pas « affecter Untel au samedi » : c'est
   « il me manque une garde samedi », puis, deux jours plus tard, « tiens,
   Untel est disponible ». Entre les deux, l'information vivait dans sa
   tête. Une grille qui n'accepte que des affectations complètes force à
   décider tout de suite ou à ne rien noter.

   Un poste à pourvoir porte déjà son jour, son service et son créneau :
   l'attribuer ne fait qu'y poser un nom, et la décision prise l'avant-veille
   n'est pas à reprendre.
   ============================================================ */

export interface PosteAttente {
  id: string;
  jour: string;
  creneauId: string;
  creneauLibelle: string;
  serviceId: string;
  serviceLibelle: string;
  note: string;
}

const jourCourt = (j: string) =>
  new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

export function PostesAttente({
  planningId,
  postes,
  jours,
  creneaux,
  services,
  agents,
  editable,
}: {
  planningId: string;
  postes: PosteAttente[];
  jours: string[];
  creneaux: CreneauOption[];
  services: Array<{ id: string; libelle: string }>;
  agents: Array<{ id: string; nom: string }>;
  editable: boolean;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = React.useState("");
  const [ouvert, setOuvert] = React.useState(false);
  const [nouveau, setNouveau] = React.useState({
    jour: jours[0] ?? "",
    creneauId: "",
    serviceId: "",
    note: "",
  });

  async function ajouter() {
    if (!nouveau.jour || !nouveau.creneauId) {
      toast.error("Choisissez au moins un jour et un créneau.");
      return;
    }
    setEnCours("ajout");
    try {
      const fd = new FormData();
      fd.set("planningId", planningId);
      fd.set("jour", nouveau.jour);
      fd.set("creneauId", nouveau.creneauId);
      fd.set("serviceId", nouveau.serviceId);
      fd.set("note", nouveau.note);
      const r = await ajouterPosteAttenteAction(fd);
      if (!r.ok) {
        toast.error("Ajout refusé", { description: r.error });
        return;
      }
      setNouveau((n) => ({ ...n, note: "" }));
      setOuvert(false);
      router.refresh();
    } finally {
      setEnCours("");
    }
  }

  async function attribuer(affectationId: string, agentId: string) {
    setEnCours(affectationId);
    try {
      const fd = new FormData();
      fd.set("planningId", planningId);
      fd.set("affectationId", affectationId);
      fd.set("agentId", agentId);
      const r = await attribuerPosteAction(fd);
      if (!r.ok) {
        toast.error("Refusé", { description: r.error });
        return;
      }
      if (r.alertes.length) {
        toast.warning("Seuil légal dépassé", { description: r.alertes[0], duration: 8000 });
      } else if (agentId) {
        toast.success("Poste attribué");
      }
      router.refresh();
    } finally {
      setEnCours("");
    }
  }

  const champ =
    "rounded-lg glass border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-accent/40";

  return (
    <GlassCard className="p-0 overflow-hidden print:hidden">
      <div className="flex items-center gap-2 border-b border-glass-border px-4 py-3">
        <h2 className="font-display text-sm font-semibold">
          Postes à pourvoir
          {postes.length > 0 && (
            <span className="ml-2 rounded-full border border-[var(--warning)]/35 bg-[var(--warning)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--warning)]">
              {postes.length}
            </span>
          )}
        </h2>
        {editable && (
          <button
            type="button"
            onClick={() => setOuvert((o) => !o)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-glass-border px-3 py-1 text-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Noter un poste
          </button>
        )}
      </div>

      {ouvert && editable && (
        <div className="flex flex-wrap items-end gap-2 border-b border-glass-border bg-foreground/[0.02] px-4 py-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Jour</span>
            <select
              value={nouveau.jour}
              onChange={(e) => setNouveau((n) => ({ ...n, jour: e.target.value }))}
              className={champ}
            >
              {jours.map((j) => (
                <option key={j} value={j}>
                  {jourCourt(j)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Créneau</span>
            <select
              value={nouveau.creneauId}
              onChange={(e) => setNouveau((n) => ({ ...n, creneauId: e.target.value }))}
              className={champ}
            >
              <option value="">— choisir —</option>
              {creneaux
                .filter((c) => c.type !== "repos")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.libelle}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Service</span>
            <select
              value={nouveau.serviceId}
              onChange={(e) => setNouveau((n) => ({ ...n, serviceId: e.target.value }))}
              className={champ}
            >
              <option value="">— indifférent —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Pourquoi (facultatif)
            </span>
            <input
              value={nouveau.note}
              onChange={(e) => setNouveau((n) => ({ ...n, note: e.target.value }))}
              placeholder="Remplacement de Fanja, congé posé…"
              className={champ}
            />
          </label>
          <button
            type="button"
            onClick={ajouter}
            disabled={enCours === "ajout"}
            className="inline-flex h-7 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 text-xs font-medium text-accent hover:bg-accent/15 transition-colors disabled:opacity-50"
          >
            {enCours === "ajout" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-3.5" aria-hidden="true" />
            )}
            Noter
          </button>
        </div>
      )}

      {postes.length === 0 ? (
        <p className="px-4 py-5 text-xs leading-relaxed text-muted-foreground">
          Aucun poste en attente. Notez ici une garde ou un service qu&apos;il faudra couvrir sans
          savoir encore par qui : la grille n&apos;oblige plus à décider tout de suite pour garder
          la trace.
        </p>
      ) : (
        <ul className="divide-y divide-glass-border">
          {postes.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-24 text-xs font-medium capitalize">{jourCourt(p.jour)}</span>
              <span className="text-xs">{p.creneauLibelle}</span>
              {p.serviceLibelle && (
                <span className="text-[11px] text-muted-foreground">{p.serviceLibelle}</span>
              )}
              {p.note && <span className="text-[11px] italic text-muted-foreground">« {p.note} »</span>}

              {editable && (
                <span className="ml-auto flex items-center gap-2">
                  {enCours === p.id ? (
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <>
                      <label className="inline-flex items-center gap-1.5">
                        <UserPlus className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        <select
                          defaultValue=""
                          onChange={(e) => e.target.value && attribuer(p.id, e.target.value)}
                          aria-label={`Attribuer le poste du ${p.jour}`}
                          className={champ}
                        >
                          <option value="">Attribuer à…</option>
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.nom}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => attribuer(p.id, "")}
                        title="Retirer ce poste de la liste"
                        className="rounded-lg p-1 text-muted-foreground hover:bg-foreground/5 hover:text-[var(--danger)] transition-colors"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
