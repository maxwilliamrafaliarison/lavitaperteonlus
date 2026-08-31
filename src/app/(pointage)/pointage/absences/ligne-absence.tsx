"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, X, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { LIBELLES_ETAT, libelleNature, type EtatAbsence } from "@/lib/pointage/absences";

import { annulerAbsenceAction, deciderAbsenceAction } from "./actions";

/* ============================================================
   UNE LIGNE D'ABSENCE
   ============================================================
   L'état se lit par un mot ET une forme, jamais par la seule couleur : le
   registre s'imprime en noir et blanc, et une personne sur douze parmi les
   hommes distingue mal le rouge du vert.
   ============================================================ */

export interface LigneAbsence {
  id: string;
  agentId: string;
  agentNom: string;
  site: string;
  nature: string;
  du: string;
  au: string;
  jours: number;
  joursDecomptes: number;
  etat: string;
  motif: string;
  demandePar: string;
  decidePar: string;
  decisionNote: string;
}

const TON: Record<string, string> = {
  demande: "border-[var(--warning,#f5a623)]/40 text-[var(--warning,#f5a623)]",
  acceptee: "border-[var(--success)]/40 text-[var(--success)]",
  refusee: "border-glass-border text-muted-foreground line-through",
  annulee: "border-glass-border text-muted-foreground line-through",
};

const SIGNE: Record<string, string> = {
  demande: "?",
  acceptee: "✓",
  refusee: "×",
  annulee: "×",
};

export function EtatPastille({ etat }: { etat: string }) {
  const mot = LIBELLES_ETAT[etat as EtatAbsence] ?? etat;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
        TON[etat] ?? "border-glass-border text-muted-foreground",
      )}
    >
      <span aria-hidden="true">{SIGNE[etat] ?? "·"}</span>
      {mot}
    </span>
  );
}

/** « du lun. 14 au ven. 18 sept. », ou le jour seul quand il n'y en a qu'un. */
export function periodeEnClair(du: string, au: string): string {
  const f = (iso: string, avecMois: boolean) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      ...(avecMois ? { month: "short" } : {}),
      timeZone: "UTC",
    });
  if (!du || !au) return "";
  if (du === au) return f(du, true);
  const memeMois = du.slice(0, 7) === au.slice(0, 7);
  return `du ${f(du, !memeMois)} au ${f(au, true)}`;
}

export function LigneAbsenceRow({
  l,
  peutAccorder,
  peutAnnuler,
}: {
  l: LigneAbsence;
  peutAccorder: boolean;
  peutAnnuler: boolean;
}) {
  const router = useRouter();
  const [encours, setEncours] = React.useState<"" | "acceptee" | "refusee" | "annulee">("");

  async function decider(decision: "acceptee" | "refusee") {
    setEncours(decision);
    try {
      const fd = new FormData();
      fd.set("id", l.id);
      fd.set("decision", decision);
      const r = await deciderAbsenceAction(fd);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else {
        toast.error("Refusé", { description: r.error });
      }
    } catch {
      // Une action serveur qui échoue au TRANSPORT (coupure, 502, session
      // expirée) rejette la promesse au lieu de rendre {ok:false}. Sans ce
      // filet, l'écran retire seulement le voyant : la personne croit avoir
      // agi, et rien n'est parti.
      toast.error("La décision n'est pas passée", {
        description:
          "La connexion a été interrompue. Vérifiez le réseau, puis recommencez.",
      });
    } finally {
      setEncours("");
    }
  }

  async function annuler() {
    /* Une absence accordée puis retirée peut avoir fait réorganiser une
       semaine entière. On demande confirmation, et on nomme la personne :
       se tromper de ligne dans un tableau est l'erreur la plus banale. */
    const verbe = l.etat === "demande" ? "Retirer la demande de" : "Annuler";
    if (!window.confirm(`${verbe} ${libelleNature(l.nature)} de ${l.agentNom} ${periodeEnClair(l.du, l.au)} ?`)) {
      return;
    }
    setEncours("annulee");
    try {
      const fd = new FormData();
      fd.set("id", l.id);
      // L'état de départ décide du droit requis : retirer une demande
      // qu'on vient de poser n'est pas défaire un congé accordé.
      fd.set("etat", l.etat);
      const r = await annulerAbsenceAction(fd);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else {
        toast.error("Refusé", { description: r.error });
      }
    } catch {
      // Une action serveur qui échoue au TRANSPORT (coupure, 502, session
      // expirée) rejette la promesse au lieu de rendre {ok:false}. Sans ce
      // filet, l'écran retire seulement le voyant : la personne croit avoir
      // agi, et rien n'est parti.
      toast.error("L'annulation n'est pas passée", {
        description:
          "La connexion a été interrompue. Vérifiez le réseau, puis recommencez.",
      });
    } finally {
      setEncours("");
    }
  }

  const termine = l.etat === "refusee" || l.etat === "annulee";

  return (
    <tr className="transition-colors hover:bg-foreground/[0.02]">
      <td className="px-5 py-3">
        <Link
          href={`/pointage/agents/${l.agentId}`}
          className={cn(
            "block truncate font-medium transition-colors hover:text-accent focus-visible:text-accent focus-visible:underline focus-visible:outline-none",
            termine && "text-muted-foreground",
          )}
        >
          {l.agentNom}
        </Link>
        <span className="block truncate text-[11px] text-muted-foreground">{l.site}</span>
      </td>
      <td className="px-5 py-3 text-sm">{libelleNature(l.nature)}</td>
      <td className="px-5 py-3">
        <span className="block text-sm">{periodeEnClair(l.du, l.au)}</span>
        <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
          {l.du} → {l.au}
        </span>
      </td>
      <td className="px-5 py-3 text-right">
        <span className="block tabular-nums">{l.jours}</span>
        {l.joursDecomptes > 0 && (
          <span className="block text-[11px] tabular-nums text-muted-foreground">
            {l.joursDecomptes} au solde
          </span>
        )}
      </td>
      <td className="px-5 py-3">
        <EtatPastille etat={l.etat} />
        {l.motif && (
          <span className="mt-1 block max-w-[16rem] truncate text-[11px] text-muted-foreground">
            {l.motif}
          </span>
        )}
      </td>
      <td className="px-5 py-3 text-right">
        <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
          {l.etat === "demande" && peutAccorder && (
            <>
              <button
                type="button"
                onClick={() => decider("acceptee")}
                disabled={encours !== ""}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--success)]/40 px-2.5 text-xs text-[var(--success)] transition-colors hover:bg-[var(--success)]/10 disabled:opacity-50"
              >
                {encours === "acceptee" ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-3.5" aria-hidden="true" />
                )}
                Accorder
              </button>
              <button
                type="button"
                onClick={() => decider("refusee")}
                disabled={encours !== ""}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-glass-border px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                {encours === "refusee" ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <X className="size-3.5" aria-hidden="true" />
                )}
                Refuser
              </button>
            </>
          )}
          {/* CE QUE LA PREMIÈRE VERSION NE PERMETTAIT PAS. Une demande en
              attente n'offrait aucune action à qui l'avait saisie : la RH
              qui se trompait de personne devait aller trouver la direction
              pour faire refuser sa propre erreur. Elle peut désormais la
              retirer, ce qui n'est pas défaire une décision puisque
              personne n'a encore décidé. */}
          {!termine && peutAnnuler && (
            <button
              type="button"
              onClick={annuler}
              disabled={encours !== ""}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-glass-border px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {encours === "annulee" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Undo2 className="size-3.5" aria-hidden="true" />
              )}
              {l.etat === "demande" ? "Retirer" : "Annuler"}
            </button>
          )}
          {termine && l.decisionNote && (
            <span className="text-[11px] text-muted-foreground">{l.decisionNote}</span>
          )}
        </span>
      </td>
    </tr>
  );
}
