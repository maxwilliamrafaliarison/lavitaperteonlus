"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, X, Pencil } from "lucide-react";
import { toast } from "sonner";

import { GlassButton } from "@/components/glass/glass-button";
import { cn } from "@/lib/utils";

import { corrigerJourneeAction, validerHeuresSupAction } from "./actions";

export interface AnomalieLigne {
  agentId: string;
  agentNom: string;
  site: string;
  jour: string;
  anomalies: string[];
  plages: string;
  heuresProposees: number; // minutes de HS proposées
}

const ABSENCES = [
  { v: "", l: "— heures corrigées —" },
  { v: "conge", l: "Congé" },
  { v: "maladie", l: "Maladie" },
  { v: "mission", l: "Mission" },
  { v: "ferie", l: "Férié" },
  { v: "absence", l: "Absence non justifiée" },
];

/** Ligne d'anomalie repliable : la correction s'ouvre au clic. */
export function CorrectionLigne({ ligne }: { ligne: AnomalieLigne }) {
  const router = useRouter();
  const [ouvert, setOuvert] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [fait, setFait] = React.useState(false);
  const [typeAbsence, setTypeAbsence] = React.useState("");

  async function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("agentId", ligne.agentId);
    fd.set("jour", ligne.jour);
    setLoading(true);
    try {
      const r = await corrigerJourneeAction(fd);
      if (r.ok) {
        toast.success(r.message);
        setFait(true);
        setOuvert(false);
        router.refresh();
      } else {
        toast.error("Correction refusée", { description: r.error });
      }
    } finally {
      setLoading(false);
    }
  }

  if (fait) {
    return (
      <tr className="text-sm">
        <td colSpan={5} className="px-5 py-3 text-accent">
          <Check className="mr-1.5 inline size-4" aria-hidden="true" />
          {ligne.agentNom} · {ligne.jour} — corrigé
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="text-sm hover:bg-white/3 transition-colors">
        <td className="px-5 py-3">
          <span className="font-medium">{ligne.agentNom}</span>
          <span className="block text-[11px] text-muted-foreground">{ligne.site}</span>
        </td>
        <td className="px-5 py-3 font-mono tabular-nums text-xs">{ligne.jour}</td>
        <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{ligne.plages || "—"}</td>
        <td className="px-5 py-3 text-xs text-warning">{ligne.anomalies.join(" · ")}</td>
        <td className="px-5 py-3 text-right">
          <button
            type="button"
            onClick={() => setOuvert((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-glass-border px-2.5 py-1 text-xs hover:bg-white/5 transition-colors"
            aria-expanded={ouvert}
          >
            {ouvert ? <X className="size-3.5" aria-hidden="true" /> : <Pencil className="size-3.5" aria-hidden="true" />}
            {ouvert ? "Annuler" : "Corriger"}
          </button>
        </td>
      </tr>
      {ouvert && (
        <tr>
          <td colSpan={5} className="bg-white/3 px-5 py-4">
            <form onSubmit={envoyer} className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    Nature
                  </span>
                  <select
                    name="typeAbsence"
                    value={typeAbsence}
                    onChange={(e) => setTypeAbsence(e.target.value)}
                    className="h-9 rounded-lg glass border px-2 text-sm"
                  >
                    {ABSENCES.map((a) => (
                      <option key={a.v} value={a.v}>{a.l}</option>
                    ))}
                  </select>
                </label>
                {!typeAbsence &&
                  ([
                    ["matinDebut", "Matin début"],
                    ["matinFin", "Matin fin"],
                    ["apremDebut", "A-m début"],
                    ["apremFin", "A-m fin"],
                  ] as const).map(([n, l]) => (
                    <label key={n} className="block">
                      <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                        {l}
                      </span>
                      <input
                        name={n}
                        type="time"
                        className="h-9 w-28 rounded-lg glass border px-2 text-sm font-mono"
                      />
                    </label>
                  ))}
              </div>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Motif de la correction <span className="text-primary">*</span>
                </span>
                <input
                  name="motif"
                  required
                  minLength={3}
                  placeholder="Ex. : oubli de badgeage à la sortie, confirmé par le responsable"
                  className="h-9 w-full rounded-lg glass border px-3 text-sm"
                />
              </label>
              <p className="text-[11px] text-muted-foreground">
                Le pointage d&apos;origine est conservé : votre correction s&apos;ajoute par-dessus,
                avec votre nom et la date. Elle reste consultable et réversible.
              </p>
              <GlassButton type="submit" variant="brand" size="sm" disabled={loading}>
                {loading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-4" aria-hidden="true" />
                )}
                Enregistrer la correction
              </GlassButton>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

/** Bouton d'octroi des heures supplémentaires proposées par le calcul. */
export function BoutonHeuresSup({
  agentId, agentNom, jour, minutes,
}: { agentId: string; agentNom: string; jour: string; minutes: number }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [fait, setFait] = React.useState(false);

  async function accorder() {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("agentId", agentId);
      fd.set("jour", jour);
      fd.set("minutes", String(minutes));
      fd.set("motif", `Heures accordées pour ${agentNom} le ${jour}`);
      const r = await validerHeuresSupAction(fd);
      if (r.ok) {
        toast.success(r.message);
        setFait(true);
        router.refresh();
      } else {
        toast.error("Refusé", { description: r.error });
      }
    } finally {
      setLoading(false);
    }
  }

  if (fait) return <span className="text-xs text-accent">✓ accordées</span>;
  return (
    <button
      type="button"
      onClick={accorder}
      disabled={loading}
      className={cn(
        "rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs text-accent",
        "hover:bg-accent/20 transition-colors disabled:opacity-50",
      )}
    >
      {loading ? "…" : "Accorder"}
    </button>
  );
}
