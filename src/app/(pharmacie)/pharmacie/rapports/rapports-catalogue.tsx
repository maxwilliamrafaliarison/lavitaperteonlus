"use client";

import * as React from "react";
import { FileText, Calendar, FileBarChart2 } from "lucide-react";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { getT, type Lang } from "@/lib/i18n";

type RapportType = "ventes" | "stock" | "a_commander" | "expiration" | "rupture";

function moisCourant(): { from: string; to: string } {
  // Calcul côté client : sert seulement à pré-remplir les champs de date.
  const d = new Date();
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const to = d.toISOString().slice(0, 10);
  return { from, to };
}

export function RapportsCatalogue({ lang }: { lang: Lang }) {
  const t = React.useMemo(() => getT(lang), [lang]);
  const def = React.useMemo(moisCourant, []);
  const [from, setFrom] = React.useState(def.from);
  const [to, setTo] = React.useState(def.to);
  const [mois, setMois] = React.useState(def.from.slice(0, 7));

  function ouvrir(type: RapportType) {
    const qs =
      type === "ventes"
        ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        : "";
    window.open(`/api/pharmacie/rapports/${type}${qs}`, "_blank", "noopener");
  }

  function ouvrirBilan() {
    const [a, m] = mois.split("-").map(Number);
    const dernier = new Date(a, m, 0).getDate(); // dernier jour du mois
    const f = `${mois}-01`;
    const to2 = `${mois}-${String(dernier).padStart(2, "0")}`;
    window.open(
      `/api/pharmacie/rapports/bilan?from=${f}&to=${to2}`,
      "_blank",
      "noopener",
    );
  }

  const autres: RapportType[] = ["stock", "a_commander", "expiration", "rupture"];
  const champ =
    "rounded-xl glass border px-3 h-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <div className="space-y-5">
      {/* Bilan mensuel — document de gestion complet */}
      <GlassCard className="p-6 space-y-4 border-accent/25">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-accent/12 p-2 text-accent">
            <FileBarChart2 className="size-5" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-lg font-semibold">
              {t("pharmacie.rapport_bilan_titre")}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("pharmacie.rapport_bilan_desc")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
              {t("pharmacie.rapports_mois")}
            </span>
            <input type="month" value={mois} onChange={(e) => setMois(e.target.value)} className={champ} />
          </label>
          <GlassButton type="button" variant="brand" size="md" onClick={ouvrirBilan}>
            <FileBarChart2 className="size-4" aria-hidden="true" />
            {t("pharmacie.rapports_generer")}
          </GlassButton>
        </div>
      </GlassCard>
      {/* Ventes — avec période */}
      <GlassCard className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-primary/12 p-2 text-primary">
            <Calendar className="size-5" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-lg font-semibold">
              {t("pharmacie.rapport_ventes_titre")}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("pharmacie.rapport_ventes_desc")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
              {t("pharmacie.rapports_du")}
            </span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={champ} />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
              {t("pharmacie.rapports_au")}
            </span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={champ} />
          </label>
          <GlassButton type="button" variant="brand" size="md" onClick={() => ouvrir("ventes")}>
            <FileText className="size-4" aria-hidden="true" />
            {t("pharmacie.rapports_generer")}
          </GlassButton>
        </div>
      </GlassCard>

      {/* Autres rapports — état courant */}
      <div className="grid gap-4 sm:grid-cols-2">
        {autres.map((type) => (
          <GlassCard key={type} className="flex flex-col justify-between p-5">
            <div>
              <h2 className="font-display text-base font-semibold">
                {t(`pharmacie.rapport_${type}_titre`)}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`pharmacie.rapport_${type}_desc`)}
              </p>
            </div>
            <div className="mt-4">
              <GlassButton type="button" variant="glass" size="md" onClick={() => ouvrir(type)}>
                <FileText className="size-4" aria-hidden="true" />
                {t("pharmacie.rapports_generer")}
              </GlassButton>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
