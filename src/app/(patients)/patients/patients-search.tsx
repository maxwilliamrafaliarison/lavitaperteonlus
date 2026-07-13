"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Loader2, User, ArrowRight } from "lucide-react";

import { GlassCard } from "@/components/glass/glass-card";
import { getT, type Lang } from "@/lib/i18n";
import type { PatientResume } from "@/lib/patients/supabase";

import { rechercherPatientesAction } from "./actions";

export function PatientsSearch({ lang }: { lang: Lang }) {
  const t = React.useMemo(() => getT(lang), [lang]);
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [patientes, setPatientes] = React.useState<PatientResume[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const debounce = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const terme = q.trim();
    if (terme.length < 2) {
      setPatientes(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      const result = await rechercherPatientesAction(terme);
      if (result.ok) {
        setPatientes(result.patientes);
        setError(null);
      } else {
        setError(result.error);
        setPatientes(null);
      }
      setLoading(false);
    }, 400);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
          aria-hidden="true"
        />
        {loading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("patients.search_placeholder")}
          aria-label={t("patients.search_placeholder")}
          autoFocus
          className="w-full h-14 rounded-2xl glass border pl-11 pr-11 text-base outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/30"
        />
      </div>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary"
        >
          {error}
        </div>
      )}

      {patientes && patientes.length === 0 && !loading && (
        <p className="text-center text-sm text-muted-foreground py-8">
          {t("patients.search_empty", { q })}
        </p>
      )}

      {patientes && patientes.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground px-1">
            {t("patients.search_count", { n: patientes.length })}
          </p>
          <ul role="list" className="grid gap-3 sm:grid-cols-2">
            {patientes.map((p) => (
              <li key={p.n_patiente}>
                <Link
                  href={`/patients/${encodeURIComponent(p.n_patiente)}`}
                  className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <GlassCard interactive className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="inline-flex size-11 items-center justify-center rounded-full bg-accent/15 text-accent shrink-0">
                        <User className="size-5" aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate group-hover:text-accent transition-colors">
                          {p.nom_prenom || t("patients.sans_nom")}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          N° {p.n_patiente}
                          {p.date_de_naissance ? ` · ${p.date_de_naissance}` : ""}
                        </p>
                      </div>
                      <ArrowRight className="size-4 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" aria-hidden="true" />
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {t("patients.nb_visites", { n: p.nb_visites })}
                      {p.derniere_visite ? ` · ${t("patients.derniere", { d: p.derniere_visite })}` : ""}
                    </p>
                  </GlassCard>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
