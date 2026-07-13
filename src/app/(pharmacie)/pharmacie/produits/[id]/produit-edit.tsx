"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { getT, type Lang } from "@/lib/i18n";
import {
  STATUT_LABELS,
  type ProduitAvecStock,
  type ProduitStatut,
} from "@/lib/pharmacie/types";

import { modifierProduitAction, ajusterStockAction } from "./actions";

export function ProduitEditPanel({
  produit,
  lang,
}: {
  produit: ProduitAvecStock;
  lang: Lang;
}) {
  const router = useRouter();
  const t = React.useMemo(() => getT(lang), [lang]);
  const [saving, setSaving] = React.useState(false);
  const [ajusting, setAjusting] = React.useState(false);
  const [stockPhysique, setStockPhysique] = React.useState<number>(produit.stock);
  const [noteAjust, setNoteAjust] = React.useState("");

  async function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => {
      const v = Number(fd.get(k));
      return Number.isFinite(v) ? v : 0;
    };
    try {
      const result = await modifierProduitAction({
        produitId: produit.id,
        prixAchat: num("prixAchat"),
        prixVente: num("prixVente"),
        stockMin: Math.trunc(num("stockMin")),
        fournisseur: String(fd.get("fournisseur") ?? ""),
        emplacement: String(fd.get("emplacement") ?? ""),
        statut: String(fd.get("statut") ?? "actif") as ProduitStatut,
      });
      if (result.ok) {
        toast.success(t("pharmacie.fiche_edit_success"));
        router.refresh();
      } else {
        toast.error(t("common.failed"), { description: result.error });
      }
    } finally {
      setSaving(false);
    }
  }

  async function ajuster(e: React.FormEvent) {
    e.preventDefault();
    setAjusting(true);
    try {
      const result = await ajusterStockAction({
        produitId: produit.id,
        stockPhysique,
        note: noteAjust,
      });
      if (result.ok) {
        toast.success(t("pharmacie.ajust_success"), {
          description: `${produit.stock} → ${stockPhysique}`,
        });
        setNoteAjust("");
        router.refresh();
      } else {
        toast.error(t("common.failed"), { description: result.error });
      }
    } finally {
      setAjusting(false);
    }
  }

  const delta = stockPhysique - produit.stock;

  return (
    <>
      {/* Édition des champs */}
      <GlassCard className="p-5">
        <h2 className="font-display text-lg font-semibold mb-4">
          {t("pharmacie.fiche_edit_title")}
        </h2>
        <form onSubmit={enregistrer} className="space-y-3">
          <div className="grid gap-3 grid-cols-2">
            <Champ label={`${t("pharmacie.reception_prix")} (Ar)`}>
              <input
                name="prixAchat"
                type="number"
                min={0}
                defaultValue={produit.prix_achat}
                className="w-full rounded-xl glass border px-3 h-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </Champ>
            <Champ label={`${t("pharmacie.col_prix")} (Ar)`}>
              <input
                name="prixVente"
                type="number"
                min={0}
                defaultValue={produit.prix_vente}
                className="w-full rounded-xl glass border px-3 h-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </Champ>
          </div>
          <div className="grid gap-3 grid-cols-2">
            <Champ label={t("pharmacie.produit_stock_min")}>
              <input
                name="stockMin"
                type="number"
                min={0}
                defaultValue={produit.stock_min}
                className="w-full rounded-xl glass border px-3 h-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </Champ>
            <Champ label={t("pharmacie.col_statut")}>
              <select
                name="statut"
                defaultValue={produit.statut}
                className="w-full rounded-xl glass border px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {(Object.keys(STATUT_LABELS) as ProduitStatut[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUT_LABELS[s][lang]}
                  </option>
                ))}
              </select>
            </Champ>
          </div>
          <Champ label={t("pharmacie.produit_emplacement")}>
            <input
              name="emplacement"
              defaultValue={produit.emplacement}
              maxLength={80}
              className="w-full rounded-xl glass border px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Champ>
          <Champ label={t("pharmacie.produit_fournisseur")}>
            <input
              name="fournisseur"
              defaultValue={produit.fournisseur}
              maxLength={80}
              className="w-full rounded-xl glass border px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Champ>
          <GlassButton
            type="submit"
            variant="brand"
            size="md"
            className="w-full"
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            {t("pharmacie.fiche_edit_save")}
          </GlassButton>
        </form>
      </GlassCard>

      {/* Ajustement d'inventaire */}
      <GlassCard className="p-5 border-[oklch(0.82_0.16_85_/_0.3)]">
        <h2 className="font-display text-lg font-semibold mb-1">
          {t("pharmacie.ajust_title")}
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          {t("pharmacie.ajust_desc")}
        </p>
        <form onSubmit={ajuster} className="space-y-3">
          <Champ label={t("pharmacie.ajust_physique")}>
            <input
              type="number"
              min={0}
              value={stockPhysique}
              onChange={(e) => setStockPhysique(Math.max(0, Math.trunc(Number(e.target.value))))}
              className="w-full rounded-xl glass border px-3 h-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Champ>
          {delta !== 0 && (
            <p className="text-xs">
              {t("pharmacie.ajust_ecart")} :{" "}
              <span
                className={
                  delta > 0
                    ? "text-[oklch(0.75_0.18_150)] font-semibold font-mono"
                    : "text-primary font-semibold font-mono"
                }
              >
                {delta > 0 ? `+${delta}` : delta}
              </span>
            </p>
          )}
          <Champ label={t("pharmacie.reception_note")}>
            <input
              type="text"
              value={noteAjust}
              onChange={(e) => setNoteAjust(e.target.value)}
              maxLength={200}
              placeholder={t("pharmacie.ajust_note_placeholder")}
              className="w-full rounded-xl glass border px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Champ>
          <GlassButton
            type="submit"
            variant="glass"
            size="md"
            className="w-full"
            disabled={ajusting || delta === 0}
          >
            {ajusting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ClipboardCheck className="size-4" aria-hidden="true" />
            )}
            {t("pharmacie.ajust_valider")}
          </GlassButton>
        </form>
      </GlassCard>
    </>
  );
}

function Champ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
