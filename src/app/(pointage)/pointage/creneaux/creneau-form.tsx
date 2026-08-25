"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { majDureeCreneauAction } from "./actions";

export interface CreneauLigne {
  id: string;
  libelle: string;
  type: string;
  debut: string;
  fin: string;
  minutes: number;
  /** Amplitude calculée depuis les bornes, pour comparaison. */
  amplitude: number;
}

const fmt = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;

/** Ligne éditable : la durée retenue peut différer de l'amplitude réelle. */
export function CreneauRow({ c }: { c: CreneauLigne }) {
  const router = useRouter();
  const [h, setH] = React.useState(Math.floor(c.minutes / 60));
  const [m, setM] = React.useState(c.minutes % 60);
  const [loading, setLoading] = React.useState(false);

  const courant = h * 60 + m;
  const modifie = courant !== c.minutes;
  // Un écart au barème n'est pas une erreur — mais il doit se voir.
  const ecart = c.type !== "repos" && c.amplitude > 0 && courant !== c.amplitude;

  async function enregistrer() {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("id", c.id);
      fd.set("heures", String(h));
      fd.set("minutes", String(m));
      const r = await majDureeCreneauAction(fd);
      if (r.ok) {
        toast.success(`${c.libelle} : durée fixée à ${fmt(r.minutes)}`);
        router.refresh();
      } else {
        toast.error("Refusé", { description: r.error });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <tr className="text-sm hover:bg-white/3 transition-colors">
      <td className="px-5 py-3">
        <span className="font-medium">{c.libelle}</span>
        <span className="block font-mono text-[11px] text-muted-foreground">{c.id}</span>
      </td>
      <td className="px-5 py-3 font-mono tabular-nums text-xs text-muted-foreground">
        {c.debut && c.fin ? `${c.debut} → ${c.fin}` : "—"}
      </td>
      <td className="px-5 py-3 text-right font-mono tabular-nums text-xs text-muted-foreground">
        {c.amplitude > 0 ? fmt(c.amplitude) : "—"}
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-1">
          <input
            type="number"
            min={0}
            max={24}
            value={h}
            onChange={(e) => setH(Math.max(0, Math.min(24, Number(e.target.value))))}
            aria-label={`Heures pour ${c.libelle}`}
            className="h-8 w-14 rounded-lg glass border px-2 text-right text-sm font-mono tabular-nums"
          />
          <span className="text-xs text-muted-foreground">h</span>
          <input
            type="number"
            min={0}
            max={59}
            step={5}
            value={m}
            onChange={(e) => setM(Math.max(0, Math.min(59, Number(e.target.value))))}
            aria-label={`Minutes pour ${c.libelle}`}
            className="h-8 w-14 rounded-lg glass border px-2 text-right text-sm font-mono tabular-nums"
          />
        </div>
      </td>
      <td className="px-5 py-3 text-right">
        {ecart && !modifie && (
          <span
            className="mr-2 inline-flex items-center gap-1 text-[11px] text-warning"
            title="La durée retenue diffère de l'amplitude horaire du créneau."
          >
            <AlertTriangle className="size-3" aria-hidden="true" />
            écart
          </span>
        )}
        {modifie && (
          <button
            type="button"
            onClick={enregistrer}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/12 px-2.5 py-1 text-xs text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-3.5" aria-hidden="true" />
            )}
            Enregistrer
          </button>
        )}
      </td>
    </tr>
  );
}
