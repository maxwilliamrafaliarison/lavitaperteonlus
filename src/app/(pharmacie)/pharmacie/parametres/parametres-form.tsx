"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Building2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { getT, type Lang } from "@/lib/i18n";

import { definirParametresAction } from "./actions";

export interface ParametresInitiaux {
  tvaActive: boolean;
  tvaTaux: number;
  siegeSocial: string;
  codeFiscal: string;
  denomination: string;
  formeJuridique: string;
  emailCaisse: string;
  nif: string;
  stat: string;
}

export function ParametresForm({
  initial,
  lang,
}: {
  initial: ParametresInitiaux;
  lang: Lang;
}) {
  const router = useRouter();
  const t = React.useMemo(() => getT(lang), [lang]);
  const [v, setV] = React.useState<ParametresInitiaux>(initial);
  const [loading, setLoading] = React.useState(false);

  const maj = <K extends keyof ParametresInitiaux>(k: K, val: ParametresInitiaux[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  // Ce qui manque aux pièces comptables, dit ici plutôt que découvert
  // au moment d'archiver un état de caisse.
  /* L'émetteur est l'établissement malgache : ce sont son adresse et ses
     deux identifiants fiscaux qui font foi. Le code fiscal italien reste
     saisissable, mais son absence n'invalide aucune pièce. */
  const incomplet = !v.siegeSocial.trim() || !v.nif.trim() || !v.stat.trim();

  async function enregistrer() {
    setLoading(true);
    try {
      const r = await definirParametresAction(v);
      if (r.ok) {
        toast.success(t("pharmacie.param_success"));
        router.refresh();
      } else {
        toast.error(t("common.failed"), { description: r.error });
      }
    } finally {
      setLoading(false);
    }
  }

  const champ =
    "w-full rounded-xl glass border px-3.5 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";
  const etiquette =
    "block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5";

  return (
    <div className="max-w-2xl space-y-5">
      {/* ---------------- TVA ---------------- */}
      <GlassCard className="p-6 space-y-5">
        <div>
          <h2 className="font-display text-lg font-semibold">
            {t("pharmacie.param_tva_titre")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("pharmacie.param_tva_aide")}
          </p>
        </div>

        <label className="flex items-center justify-between gap-4 rounded-xl glass border px-4 py-3">
          <span className="text-sm font-medium">{t("pharmacie.param_tva_active")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={v.tvaActive}
            onClick={() => maj("tvaActive", !v.tvaActive)}
            /* Piste inactive en `border` plutôt qu'en blanc translucide :
               sur fond clair, `bg-white/15` était invisible et l'on ne
               voyait plus si la TVA était active. */
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
              v.tvaActive ? "bg-primary border-primary" : "bg-foreground/10 border-glass-border"
            }`}
          >
            <span
              className={`inline-block size-5 transform rounded-full bg-white shadow transition-transform ${
                v.tvaActive ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>

        <label className={`block transition-opacity ${v.tvaActive ? "" : "opacity-40"}`}>
          <span className={etiquette}>{t("pharmacie.param_tva_taux")}</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              disabled={!v.tvaActive}
              value={v.tvaTaux}
              onChange={(e) =>
                maj("tvaTaux", Math.min(100, Math.max(0, Number(e.target.value) || 0)))
              }
              className="w-32 rounded-xl glass border px-3.5 h-11 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </label>
      </GlassCard>

      {/* ---------------- Identité légale ---------------- */}
      <GlassCard className="p-6 space-y-5">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Building2 className="size-4 text-accent" aria-hidden="true" />
            {t("pharmacie.param_entite_titre")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("pharmacie.param_entite_aide")}
          </p>
        </div>

        {incomplet && (
          <p className="flex items-start gap-2 rounded-xl border border-[var(--warning)]/35 bg-[var(--warning)]/10 px-3.5 py-2.5 text-sm">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-[var(--warning)]"
              aria-hidden="true"
            />
            <span>{t("pharmacie.param_entite_incomplet")}</span>
          </p>
        )}

        <label className="block">
          <span className={etiquette}>{t("pharmacie.param_entite_adresse")}</span>
          <input
            value={v.siegeSocial}
            onChange={(e) => maj("siegeSocial", e.target.value)}
            placeholder="Lot IN 34 …, Fianarantsoa, Madagascar"
            className={champ}
          />
        </label>

        <label className="block">
          <span className={etiquette}>{t("pharmacie.param_entite_code_fiscal")}</span>
          <input
            value={v.codeFiscal}
            onChange={(e) => maj("codeFiscal", e.target.value)}
            placeholder="facultatif : organisation mère"
            className={`${champ} font-mono`}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={etiquette}>{t("pharmacie.param_entite_nif")}</span>
            <input
              value={v.nif}
              onChange={(e) => maj("nif", e.target.value)}
              placeholder="0000xxxxxxx"
              className={`${champ} font-mono`}
            />
          </label>
          <label className="block">
            <span className={etiquette}>{t("pharmacie.param_entite_stat")}</span>
            <input
              value={v.stat}
              onChange={(e) => maj("stat", e.target.value)}
              placeholder="00000 00 0000 0 00000"
              className={`${champ} font-mono`}
            />
          </label>
        </div>

        <label className="block">
          <span className={etiquette}>{t("pharmacie.param_entite_denomination")}</span>
          <input
            value={v.denomination}
            onChange={(e) => maj("denomination", e.target.value)}
            placeholder="La Vita Per Te, ONG-ODV Alfeo Corassori"
            className={champ}
          />
        </label>

        <label className="block">
          <span className={etiquette}>{t("pharmacie.param_entite_forme")}</span>
          <input
            value={v.formeJuridique}
            onChange={(e) => maj("formeJuridique", e.target.value)}
            placeholder="Organizzazione di Volontariato (ODV) · Ente del Terzo Settore"
            className={champ}
          />
        </label>

        <label className="block">
          <span className={etiquette}>{t("pharmacie.param_entite_email_caisse")}</span>
          <input
            value={v.emailCaisse}
            onChange={(e) => maj("emailCaisse", e.target.value)}
            placeholder="compta.lavitaperte@gmail.com, direction.lavitaperte@gmail.com"
            className={champ}
          />
          <span className="mt-1.5 block text-xs text-muted-foreground">
            {t("pharmacie.param_entite_email_aide")}
          </span>
        </label>
      </GlassCard>

      <GlassButton
        type="button"
        variant="brand"
        size="md"
        onClick={enregistrer}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Save className="size-4" aria-hidden="true" />
        )}
        {t("pharmacie.param_enregistrer")}
      </GlassButton>
    </div>
  );
}
