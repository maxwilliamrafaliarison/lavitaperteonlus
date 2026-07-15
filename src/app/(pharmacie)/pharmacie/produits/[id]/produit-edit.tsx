"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, ClipboardCheck, Scissors } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { getT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { prixDetailSuggere } from "@/lib/pharmacie/fractionnement";
import {
  STATUT_LABELS,
  type ProduitAvecStock,
  type ProduitStatut,
} from "@/lib/pharmacie/types";

import {
  modifierProduitAction,
  ajusterStockAction,
  definirFractionnementAction,
} from "./actions";

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
  const [stockPhysique, setStockPhysique] = React.useState<number>(produit.stockBase);
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
          description: `${produit.stockBase} → ${stockPhysique}`,
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

  const delta = stockPhysique - produit.stockBase;

  /* ---- Vente à l'unité ---------------------------------------------- */
  const [fractActif, setFractActif] = React.useState(produit.facteur_conversion > 1);
  const [facteur, setFacteur] = React.useState(
    produit.facteur_conversion > 1 ? produit.facteur_conversion : 30,
  );
  const [unite, setUnite] = React.useState(produit.unite_detail);
  const [prixDetail, setPrixDetail] = React.useState(produit.prix_vente_detail);
  // La suggestion de prix s'arrête dès la première saisie manuelle. En
  // édition, un prix déjà fixé compte comme une saisie : on ne l'écrase pas.
  const [prixTouche, setPrixTouche] = React.useState(produit.prix_vente_detail > 0);
  const [fractSaving, setFractSaving] = React.useState(false);

  const suggestion = prixDetailSuggere(produit.prix_vente, facteur);

  function changerFacteur(n: number) {
    const f = Number.isFinite(n) && n >= 2 ? n : 2;
    setFacteur(f);
    if (!prixTouche) setPrixDetail(prixDetailSuggere(produit.prix_vente, f));
  }

  function basculerFract(actif: boolean) {
    setFractActif(actif);
    if (actif && !prixTouche) setPrixDetail(prixDetailSuggere(produit.prix_vente, facteur));
  }

  const facteurVoulu = fractActif ? facteur : 1;
  const ancien = produit.facteur_conversion;
  const fractModifie =
    facteurVoulu !== ancien ||
    (fractActif && (unite !== produit.unite_detail || prixDetail !== produit.prix_vente_detail));

  /**
   * Ce qui va arriver au stock, calculé ici pour être ANNONCÉ avant de
   * valider. Le serveur refait ce calcul — celui-ci n'est qu'un affichage.
   */
  const avertissement = React.useMemo(() => {
    if (facteurVoulu === ancien) return null;
    if (ancien === 1) {
      // Les boîtes deviennent des unités.
      return {
        grave: false,
        texte: t("pharmacie.fract_avert_active", {
          avant: produit.stockBase,
          apres: produit.stockBase * facteurVoulu,
        }),
      };
    }
    if (facteurVoulu === 1) {
      // Retour aux boîtes : l'appoint n'a plus d'unité pour exister.
      const boites = Math.trunc(produit.stockBase / ancien);
      const perdu = produit.stockBase - boites * ancien;
      return {
        grave: perdu > 0,
        texte: t("pharmacie.fract_avert_desactive", { apres: boites, perdu }),
      };
    }
    // Changement de conditionnement : l'unité de comptage ne bouge pas.
    return {
      grave: false,
      texte: t("pharmacie.fract_avert_facteur", { stock: produit.stockBase }),
    };
  }, [facteurVoulu, ancien, produit.stockBase, t]);

  async function enregistrerFract() {
    setFractSaving(true);
    try {
      const result = await definirFractionnementAction({
        produitId: produit.id,
        facteurConversion: facteurVoulu,
        uniteDetail: fractActif ? unite.trim() : "",
        prixVenteDetail: fractActif ? prixDetail : 0,
      });
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(t("common.failed"), { description: result.error });
      }
    } finally {
      setFractSaving(false);
    }
  }

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

      {/* Vente à l'unité (fractionnement) */}
      <GlassCard className="p-5">
        <h2 className="font-display text-lg font-semibold">
          {t("pharmacie.fract_title")}
        </h2>
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          {t("pharmacie.fract_desc")}
        </p>

        <label className="flex items-center gap-2.5 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={fractActif}
            onChange={(e) => basculerFract(e.target.checked)}
            className="size-4 rounded accent-[oklch(0.75_0.18_150)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <span className="text-sm">{t("pharmacie.fract_actif")}</span>
        </label>

        {fractActif && (
          <div className="space-y-3">
            <div className="grid gap-3 grid-cols-2">
              <Champ label={t("pharmacie.fract_facteur")}>
                <input
                  type="number"
                  min={2}
                  step={1}
                  value={facteur}
                  onChange={(e) => changerFacteur(Math.trunc(Number(e.target.value)))}
                  aria-describedby="aide-facteur"
                  className="w-full rounded-xl glass border px-3 h-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <span id="aide-facteur" className="mt-1 block text-[10px] text-muted-foreground">
                  {t("pharmacie.fract_facteur_aide")}
                </span>
              </Champ>
              <Champ label={t("pharmacie.fract_unite")}>
                <input
                  type="text"
                  value={unite}
                  onChange={(e) => setUnite(e.target.value)}
                  maxLength={30}
                  placeholder={t("pharmacie.fract_unite_aide")}
                  className="w-full rounded-xl glass border px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </Champ>
            </div>
            <Champ label={`${t("pharmacie.fract_prix")} (Ar)`}>
              <input
                type="number"
                min={0}
                value={prixDetail}
                onChange={(e) => {
                  // Dès que le pharmacien saisit lui-même, on cesse de
                  // suggérer : c'est lui qui fixe ses prix, pas le calcul.
                  setPrixTouche(true);
                  setPrixDetail(Math.max(0, Math.trunc(Number(e.target.value))));
                }}
                aria-describedby="aide-prix"
                className="w-full rounded-xl glass border px-3 h-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <span id="aide-prix" className="mt-1 block text-[10px] text-muted-foreground">
                {t("pharmacie.fract_prix_aide", { n: suggestion })}
              </span>
            </Champ>
          </div>
        )}

        {/* Ce qui va réellement arriver au stock, annoncé AVANT de valider */}
        {avertissement && (
          <p
            className={cn(
              "mt-4 rounded-xl border p-3 text-xs leading-relaxed",
              avertissement.grave
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-glass-border bg-white/3 text-muted-foreground",
            )}
          >
            {avertissement.texte}
          </p>
        )}

        <GlassButton
          type="button"
          onClick={enregistrerFract}
          variant="glass"
          size="md"
          className="mt-4 w-full"
          disabled={fractSaving || !fractModifie}
        >
          {fractSaving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Scissors className="size-4" aria-hidden="true" />
          )}
          {t("pharmacie.fract_save")}
        </GlassButton>
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
