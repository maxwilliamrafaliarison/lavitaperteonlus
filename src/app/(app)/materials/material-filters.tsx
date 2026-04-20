"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { MATERIAL_TYPE_LABELS, type MaterialType } from "@/types";
import type { Site } from "@/types";

interface MaterialFiltersProps {
  sites: Site[];
  initialQuery?: string;
  initialType?: string;
  initialSite?: string;
}

const TYPES: MaterialType[] = [
  "ordinateur_fixe",
  "ordinateur_portable",
  "ordinateur_bdd",
  "imprimante",
  "scanner",
  "routeur",
  "switch",
  "box",
  "telephone",
  "serveur",
  "ecran",
  "peripherique",
  "autre",
];

export function MaterialFilters({
  sites,
  initialQuery = "",
  initialType = "",
  initialSite = "",
}: MaterialFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = React.useState(initialQuery);

  // Debounced URL update
  React.useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query) params.set("q", query);
      else params.delete("q");
      router.replace(`/materials?${params.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`/materials?${params.toString()}`, { scroll: false });
  }

  const hasFilters = query || initialType || initialSite;

  function clear() {
    setQuery("");
    router.replace("/materials", { scroll: false });
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative flex-1 min-w-0 max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par REF, désignation, marque, série…"
          className="w-full h-11 rounded-2xl glass border pl-11 pr-4 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={initialSite}
          onChange={(e) => setParam("site", e.target.value)}
          className="h-11 rounded-2xl glass border px-3 text-sm outline-none focus:border-primary/50"
          aria-label="Filtrer par site"
        >
          <option value="">Tous les sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={initialType}
          onChange={(e) => setParam("type", e.target.value)}
          className="h-11 rounded-2xl glass border px-3 text-sm outline-none focus:border-primary/50"
          aria-label="Filtrer par type"
        >
          <option value="">Tous les types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {MATERIAL_TYPE_LABELS[t].fr}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={clear}
            className="inline-flex items-center gap-1.5 h-11 px-4 rounded-2xl glass border text-sm hover:bg-white/10 transition-colors text-muted-foreground"
          >
            <X className="size-4" />
            Effacer
          </button>
        )}
      </div>
    </div>
  );
}
