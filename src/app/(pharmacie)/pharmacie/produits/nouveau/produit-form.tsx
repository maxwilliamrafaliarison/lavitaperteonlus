"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { getT, type Lang } from "@/lib/i18n";

import { creerProduitAction } from "./actions";

export function ProduitForm({
  classes,
  formes,
  lang,
}: {
  classes: string[];
  formes: string[];
  lang: Lang;
}) {
  const router = useRouter();
  const t = React.useMemo(() => getT(lang), [lang]);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => {
      const v = Number(fd.get(k));
      return Number.isFinite(v) ? v : 0;
    };
    try {
      const result = await creerProduitAction({
        designation: String(fd.get("designation") ?? ""),
        dci: String(fd.get("dci") ?? ""),
        classe: String(fd.get("classe") ?? ""),
        forme: String(fd.get("forme") ?? ""),
        dosage: String(fd.get("dosage") ?? ""),
        conditionnement: String(fd.get("conditionnement") ?? ""),
        prixAchat: num("prixAchat"),
        prixVente: num("prixVente"),
        stockMin: Math.trunc(num("stockMin")),
        emplacement: String(fd.get("emplacement") ?? ""),
        fournisseur: String(fd.get("fournisseur") ?? ""),
        quantiteInitiale: Math.trunc(num("quantiteInitiale")),
        numeroLot: String(fd.get("numeroLot") ?? ""),
        dateExpiration: String(fd.get("dateExpiration") ?? ""),
      });
      if (result.ok) {
        toast.success(t("pharmacie.produit_success"), {
          description: result.produitId,
        });
        router.push("/pharmacie");
        router.refresh();
      } else {
        toast.error(t("common.failed"), { description: result.error });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-5">
      <p className="text-[11px] text-muted-foreground">
        <span aria-hidden="true" className="text-primary">*</span>{" "}
        {t("a11y.required_legend")}
      </p>

      <GlassCard className="p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">
          {t("pharmacie.produit_section_identite")}
        </h2>

        <Field label={t("pharmacie.col_designation")} required requiredLabel={t("a11y.required_indicator")}>
          <input
            name="designation"
            required
            minLength={2}
            maxLength={120}
            placeholder="DOLIPRANE"
            className="w-full rounded-xl glass border px-3.5 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="DCI">
            <input
              name="dci"
              maxLength={120}
              placeholder="Paracétamol"
              className="w-full rounded-xl glass border px-3.5 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>
          <Field label={t("pharmacie.col_classe")}>
            <input
              name="classe"
              list="classes-list"
              maxLength={80}
              placeholder="ANTIBIOTIQUE"
              className="w-full rounded-xl glass border px-3.5 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <datalist id="classes-list">
              {classes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("pharmacie.produit_forme")}>
            <input
              name="forme"
              list="formes-list"
              maxLength={60}
              placeholder="COMPRIMÉ"
              className="w-full rounded-xl glass border px-3.5 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <datalist id="formes-list">
              {formes.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </Field>
          <Field label={t("pharmacie.produit_dosage")}>
            <input
              name="dosage"
              maxLength={60}
              placeholder="500mg"
              className="w-full rounded-xl glass border px-3.5 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>
          <Field label={t("pharmacie.produit_conditionnement")}>
            <input
              name="conditionnement"
              maxLength={80}
              placeholder="BOITE DE 12"
              className="w-full rounded-xl glass border px-3.5 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>
        </div>
      </GlassCard>

      <GlassCard className="p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">
          {t("pharmacie.produit_section_prix")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={`${t("pharmacie.reception_prix")} (Ar)`}>
            <input
              name="prixAchat"
              type="number"
              min={0}
              defaultValue={0}
              className="w-full rounded-xl glass border px-3.5 h-11 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>
          <Field label={`${t("pharmacie.col_prix")} (Ar)`} required requiredLabel={t("a11y.required_indicator")}>
            <input
              name="prixVente"
              type="number"
              min={0}
              required
              className="w-full rounded-xl glass border px-3.5 h-11 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>
          <Field label={t("pharmacie.produit_stock_min")}>
            <input
              name="stockMin"
              type="number"
              min={0}
              defaultValue={0}
              className="w-full rounded-xl glass border px-3.5 h-11 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("pharmacie.produit_emplacement")}>
            <input
              name="emplacement"
              maxLength={80}
              placeholder="Étagère B2"
              className="w-full rounded-xl glass border px-3.5 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>
          <Field label={t("pharmacie.produit_fournisseur")}>
            <input
              name="fournisseur"
              maxLength={80}
              className="w-full rounded-xl glass border px-3.5 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>
        </div>
      </GlassCard>

      <GlassCard className="p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">
          {t("pharmacie.produit_section_stock")}
        </h2>
        <p className="text-xs text-muted-foreground -mt-2">
          {t("pharmacie.produit_stock_hint")}
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("pharmacie.reception_quantite")}>
            <input
              name="quantiteInitiale"
              type="number"
              min={0}
              defaultValue={0}
              className="w-full rounded-xl glass border px-3.5 h-11 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>
          <Field label={t("pharmacie.reception_lot")}>
            <input
              name="numeroLot"
              maxLength={60}
              className="w-full rounded-xl glass border px-3.5 h-11 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>
          <Field label={t("pharmacie.reception_expiration")}>
            <input
              name="dateExpiration"
              type="date"
              className="w-full rounded-xl glass border px-3.5 h-11 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>
        </div>
      </GlassCard>

      <GlassButton
        type="submit"
        variant="brand"
        size="lg"
        className="w-full"
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <PackagePlus className="size-4" aria-hidden="true" />
        )}
        {t("pharmacie.produit_valider")}
      </GlassButton>
    </form>
  );
}

function Field({
  label,
  children,
  required,
  requiredLabel,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  requiredLabel?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
        {label}
        {required && (
          <>
            {" "}
            <span aria-label={requiredLabel} className="text-primary">*</span>
          </>
        )}
      </span>
      {children}
    </label>
  );
}
