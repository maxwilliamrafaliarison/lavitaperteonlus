"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CopyPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { dupliquerSemaineAction } from "./actions";

/**
 * Recopie la semaine précédente sur la semaine affichée — LE geste des
 * logiciels d'emploi du temps : la semaine type se propage, puis s'ajuste.
 * Les jours déjà planifiés sont préservés, jamais écrasés.
 */
export function DupliquerSemaine({
  planningId,
  source,
  cible,
}: {
  planningId: string;
  source: string;
  cible: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function dupliquer() {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("planningId", planningId);
      fd.set("source", source);
      fd.set("cible", cible);
      const r = await dupliquerSemaineAction(fd);
      if (!r.ok) {
        toast.error("Duplication refusée", { description: r.error });
        return;
      }
      toast.success(
        r.copiees > 0
          ? `${r.copiees} affectation(s) recopiée(s)${r.ignorees ? ` · ${r.ignorees} jour(s) déjà planifié(s) préservé(s)` : ""}`
          : "Rien à recopier : la semaine précédente est vide, ou tout est déjà planifié.",
      );
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={dupliquer}
      disabled={loading}
      title={`Recopier la semaine du ${source} sur celle du ${cible}`}
      className="inline-flex items-center gap-1.5 rounded-xl border border-glass-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <CopyPlus className="size-3.5" aria-hidden="true" />}
      Recopier la semaine précédente
    </button>
  );
}
