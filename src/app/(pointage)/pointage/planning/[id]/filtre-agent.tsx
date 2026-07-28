"use client";

import { useRouter } from "next/navigation";

/**
 * Choix du personnel affiché dans la grille horaire.
 *
 * Le choix vit dans l'URL comme le reste (vue, période, mode) : une vue
 * filtrée sur un agent se partage donc par lien, et les flèches du
 * navigateur naviguent entre les personnes consultées.
 */
export function FiltreAgent({
  planningId,
  vue,
  debut,
  agents,
  selection,
}: {
  planningId: string;
  vue: string;
  debut: string;
  agents: Array<{ id: string; nom: string }>;
  selection: string;
}) {
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        Personnel
      </span>
      <select
        value={selection}
        onChange={(e) => {
          const p = new URLSearchParams({ vue, debut, mode: "edt" });
          if (e.target.value) p.set("agent", e.target.value);
          router.push(`/pointage/planning/${planningId}?${p.toString()}`);
        }}
        className="h-9 max-w-56 rounded-xl glass border px-2 text-sm"
      >
        <option value="">Tout le personnel</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nom}
          </option>
        ))}
      </select>
    </label>
  );
}
