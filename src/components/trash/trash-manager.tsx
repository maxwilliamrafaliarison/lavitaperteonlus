"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RotateCcw, Trash2, Loader2, AlertTriangle, X,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { MaterialTypeIcon } from "@/components/materials/type-icon";
import { cn } from "@/lib/utils";
import type { Material, Site, Room } from "@/types";
import { MATERIAL_TYPE_LABELS } from "@/types";

import {
  restoreMaterialAction,
  hardDeleteMaterialAction,
} from "@/components/materials/delete-actions";

interface Props {
  items: Material[];
  sites: Site[];
  rooms: Room[];
}

export function TrashManager({ items, sites, rooms }: Props) {
  const router = useRouter();
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [confirmHard, setConfirmHard] = React.useState<Material | null>(null);

  const siteMap = new Map(sites.map((s) => [s.id, s]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  async function handleRestore(material: Material) {
    setLoadingId(material.id);
    try {
      const result = await restoreMaterialAction(material.id);
      if (result.ok) {
        toast.success("Matériel restauré", {
          description: `${material.designation || material.ref} est de nouveau actif.`,
        });
        router.refresh();
      } else {
        toast.error("Échec", { description: result.error });
      }
    } catch (e) {
      toast.error("Erreur", { description: String(e) });
    } finally {
      setLoadingId(null);
    }
  }

  async function handleHardDelete(material: Material) {
    setLoadingId(material.id);
    try {
      const result = await hardDeleteMaterialAction(material.id);
      if (result.ok) {
        toast.success("Suppression définitive", {
          description: `${material.ref} a été retiré du Sheet.`,
        });
        setConfirmHard(null);
        router.refresh();
      } else {
        toast.error("Échec", { description: result.error });
      }
    } catch (e) {
      toast.error("Erreur", { description: String(e) });
    } finally {
      setLoadingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <GlassCard className="p-10 text-center max-w-2xl mx-auto">
        <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Trash2 className="size-6" />
        </div>
        <h3 className="mt-6 font-display text-xl font-semibold">Corbeille vide</h3>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Aucun matériel supprimé. Les éléments mis à la corbeille apparaîtront
          ici — vous pourrez les restaurer ou les supprimer définitivement.
        </p>
      </GlassCard>
    );
  }

  return (
    <>
      <GlassCard className="p-2">
        <div className="divide-y divide-glass-border">
          {items.map((m) => {
            const site = siteMap.get(m.siteId);
            const room = roomMap.get(m.roomId);
            const busy = loadingId === m.id;
            return (
              <div
                key={m.id}
                className="flex items-start gap-4 px-4 py-4 hover:bg-white/3 transition-colors rounded-2xl"
              >
                <div className="inline-flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground shrink-0">
                  <MaterialTypeIcon type={m.type} className="size-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/materials/${m.id}`}
                      className="font-medium text-sm hover:text-primary transition-colors inline-flex items-center gap-1"
                    >
                      {m.designation || m.ref}
                      <ExternalLink className="size-3 opacity-60" />
                    </Link>
                    <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                      {MATERIAL_TYPE_LABELS[m.type].fr}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground font-mono truncate">
                    {m.ref}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>
                      {site?.code ?? "—"} · {room?.name ?? "—"}
                    </span>
                    {m.deletedAt && (
                      <span className="font-mono">
                        Supprimé le {fmtDate(m.deletedAt)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <GlassButton
                    type="button"
                    variant="glass"
                    size="sm"
                    onClick={() => handleRestore(m)}
                    disabled={busy}
                  >
                    {busy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="size-3.5" />
                    )}
                    Restaurer
                  </GlassButton>
                  <GlassButton
                    type="button"
                    variant="glass"
                    size="sm"
                    onClick={() => setConfirmHard(m)}
                    disabled={busy}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3.5" />
                  </GlassButton>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Modal confirmation hard delete */}
      {confirmHard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => !loadingId && setConfirmHard(null)}
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
                onClick={() => setConfirmHard(null)}
                disabled={!!loadingId}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Fermer"
              >
                <X className="size-4" />
              </button>
            </div>

            <h3 className="font-display text-lg font-semibold">
              Supprimer définitivement ?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {confirmHard.designation || confirmHard.ref}
              </span>{" "}
              sera retiré du Google Sheet.{" "}
              <span className="text-primary">Cette action est irréversible.</span>
            </p>
            <div className="mt-3 rounded-xl border border-primary/30 bg-primary/8 p-3 text-xs text-primary">
              Les sessions (MDP) et les mouvements associés resteront visibles
              dans l&apos;historique Google Sheet pour la traçabilité.
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <GlassButton
                type="button"
                variant="glass"
                size="sm"
                onClick={() => setConfirmHard(null)}
                disabled={!!loadingId}
              >
                Annuler
              </GlassButton>
              <GlassButton
                type="button"
                variant="brand"
                size="sm"
                onClick={() => handleHardDelete(confirmHard)}
                disabled={!!loadingId}
              >
                {loadingId === confirmHard.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                Supprimer définitivement
              </GlassButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
