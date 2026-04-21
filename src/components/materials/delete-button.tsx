"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";

import { GlassButton } from "@/components/glass/glass-button";
import { cn } from "@/lib/utils";
import { getT, type Lang } from "@/lib/i18n";
import { softDeleteMaterialAction } from "./delete-actions";

interface Props {
  materialId: string;
  materialLabel: string;
  lang?: Lang;
}

export function DeleteMaterialButton({ materialId, materialLabel, lang = "fr" }: Props) {
  const router = useRouter();
  const t = React.useMemo(() => getT(lang), [lang]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const result = await softDeleteMaterialAction(materialId);
      if (result.ok) {
        toast.success(t("delete_material.success_title"), {
          description: t("delete_material.success_desc"),
        });
        router.push("/materials");
        router.refresh();
      } else {
        toast.error("Échec", { description: result.error });
      }
    } catch (e) {
      toast.error("Erreur", { description: String(e) });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <>
      <GlassButton
        variant="glass"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="size-3.5" />
        {t("actions.delete")}
      </GlassButton>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => !loading && setOpen(false)}
        >
          <div
            className={cn(
              "w-full max-w-md rounded-3xl glass-strong border-glass-border",
              "p-6 shadow-2xl animate-in zoom-in-95 duration-200",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <AlertTriangle className="size-5" />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={loading}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t("common.close")}
              >
                <X className="size-4" />
              </button>
            </div>

            <h3 className="font-display text-lg font-semibold">
              {t("delete_material.title")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{materialLabel}</span>{" "}
              {t("delete_material.desc_part_1")}{" "}
              <span className="text-foreground">{t("delete_material.desc_reversible")}</span>{" "}
              {t("delete_material.desc_part_2")}{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/trash</code>.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("delete_material.note_preserved")}
            </p>

            <div className="mt-6 flex gap-2 justify-end">
              <GlassButton
                type="button"
                variant="glass"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                {t("common.cancel")}
              </GlassButton>
              <GlassButton
                type="button"
                variant="brand"
                size="sm"
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                {t("delete_material.title")}
              </GlassButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
