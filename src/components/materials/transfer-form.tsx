"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { cn } from "@/lib/utils";
import { getT, type Lang } from "@/lib/i18n";
import type { Site, Room, Material } from "@/types";

import { transferMaterialAction } from "./transfer-actions";

interface Props {
  material: Material;
  sites: Site[];
  rooms: Room[];
  currentSite: Site | null;
  currentRoom: Room | null;
  lang?: Lang;
}

export function TransferForm({
  material,
  sites,
  rooms,
  currentSite,
  currentRoom,
  lang = "fr",
}: Props) {
  const router = useRouter();
  const t = getT(lang);
  const [toSiteId, setToSiteId] = React.useState(material.siteId);
  const [toRoomId, setToRoomId] = React.useState(material.roomId);
  const [toAssignedTo, setToAssignedTo] = React.useState(material.assignedTo ?? "");
  const [reason, setReason] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const availableRooms = rooms.filter((r) => r.siteId === toSiteId);

  // Si on change de site, reset la salle vers la première dispo dans ce site
  React.useEffect(() => {
    if (!availableRooms.some((r) => r.id === toRoomId)) {
      setToRoomId(availableRooms[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toSiteId]);

  const unchanged =
    toSiteId === material.siteId &&
    toRoomId === material.roomId &&
    (toAssignedTo || undefined) === material.assignedTo;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.set("toSiteId", toSiteId);
    formData.set("toRoomId", toRoomId);
    formData.set("toAssignedTo", toAssignedTo);
    formData.set("reason", reason);

    try {
      const result = await transferMaterialAction(material.id, formData);
      if (result.ok) {
        toast.success(t("transfer.success_title"), {
          description: t("transfer.success_desc"),
        });
        router.push(`/materials/${material.id}`);
        router.refresh();
      } else {
        setError(result.error ?? t("material_form.error_generic"));
        toast.error(t("errors.generic_title"), { description: result.error });
      }
    } catch (e) {
      setError(String(e));
      toast.error(t("errors.generic_title"), { description: String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Link
        href={`/materials/${material.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        {t("common.back")}
      </Link>

      <GlassCard className="p-7 md:p-8">
        <div className="flex items-start gap-3">
          <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ArrowRightLeft className="size-5" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {t("transfer.eyebrow")}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold">
              {material.designation || material.ref}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground font-mono">
              {material.ref}
            </p>
          </div>
        </div>

        {/* Actuel → Cible */}
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {/* Source */}
          <div className="rounded-2xl border border-glass-border bg-white/3 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
              {t("transfer.current_location")}
            </p>
            <dl className="space-y-1.5 text-sm">
              <KV label={t("material_form.field_site")} value={currentSite?.name ?? "—"} />
              <KV label={t("material_form.field_room")} value={currentRoom?.name ?? "—"} />
              <KV label={t("material_form.field_assigned_to")} value={material.assignedTo ?? "—"} />
            </dl>
          </div>

          {/* Destination */}
          <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-primary mb-3">
              {t("transfer.destination")}
            </p>
            <div className="space-y-3">
              <FieldLabel htmlFor="toSiteId">{t("material_form.field_site")}</FieldLabel>
              <GlassSelect
                id="toSiteId"
                value={toSiteId}
                onChange={(e) => setToSiteId(e.target.value)}
                required
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </GlassSelect>

              <FieldLabel htmlFor="toRoomId">{t("material_form.field_room")}</FieldLabel>
              <GlassSelect
                id="toRoomId"
                value={toRoomId}
                onChange={(e) => setToRoomId(e.target.value)}
                required
                disabled={availableRooms.length === 0}
              >
                {availableRooms.length === 0 && (
                  <option value="">{t("material_form.field_room_empty")}</option>
                )}
                {availableRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.code ? ` (${r.code})` : ""}
                  </option>
                ))}
              </GlassSelect>

              <FieldLabel htmlFor="toAssignedTo">
                {t("material_form.field_assigned_to")} ({t("common.optional")})
              </FieldLabel>
              <GlassInput
                id="toAssignedTo"
                value={toAssignedTo}
                onChange={(e) => setToAssignedTo(e.target.value)}
                placeholder={t("material_form.field_assigned_to_placeholder")}
              />
            </div>
          </div>
        </div>

        {/* Motif */}
        <div className="mt-6">
          <FieldLabel htmlFor="reason">{t("transfer.reason_label")}</FieldLabel>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t("transfer.reason_placeholder")}
            className={cn(
              "w-full rounded-xl glass border px-3.5 py-2.5 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-primary/40",
              "placeholder:text-muted-foreground/60 resize-y",
            )}
          />
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
            {error}
          </div>
        )}

        <div className="mt-7 pt-6 border-t border-glass-border flex flex-wrap gap-2 justify-end">
          <Link href={`/materials/${material.id}`}>
            <GlassButton type="button" variant="glass" size="md">
              {t("common.cancel")}
            </GlassButton>
          </Link>
          <GlassButton
            type="submit"
            variant="brand"
            size="md"
            disabled={loading || unchanged}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowRightLeft className="size-4" />
            )}
            {loading ? t("transfer.submitting") : t("transfer.submit")}
          </GlassButton>
        </div>

        {unchanged && !loading && (
          <p className="mt-3 text-xs text-muted-foreground text-right">
            {t("transfer.no_change_hint")}
          </p>
        )}
      </GlassCard>
    </form>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium truncate max-w-[60%]" title={value}>
        {value}
      </dd>
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5"
    >
      {children}
    </label>
  );
}

function GlassSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-xl glass border px-3 h-10 text-sm",
        "focus:outline-none focus:ring-2 focus:ring-primary/40",
        "disabled:opacity-50",
        props.className,
      )}
    >
      {props.children}
    </select>
  );
}

function GlassInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type="text"
      className={cn(
        "w-full rounded-xl glass border px-3.5 h-10 text-sm",
        "focus:outline-none focus:ring-2 focus:ring-primary/40",
        "placeholder:text-muted-foreground/60",
        props.className,
      )}
    />
  );
}
