"use client";

import * as React from "react";
import {
  FileText, AlertOctagon, Banknote, ArrowRightLeft, Users as UsersIcon,
  DoorOpen, Download, Loader2, X, Calendar,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { cn } from "@/lib/utils";
import { getT, type Lang } from "@/lib/i18n";
import type { Site, Room, AppUser, MaterialType, MaterialState, MovementType } from "@/types";
import { MATERIAL_TYPE_LABELS } from "@/types";
import type { ReportType, ReportFilters } from "@/lib/reports/types";
import { REPORT_CATALOG } from "@/lib/reports/types";

interface Props {
  sites: Site[];
  rooms: Room[];
  users: AppUser[];
  lang?: Lang;
}

const ICONS: Record<ReportType, typeof FileText> = {
  inventaire: FileText,
  a_remplacer: AlertOctagon,
  valorisation: Banknote,
  mouvements: ArrowRightLeft,
  par_utilisateur: UsersIcon,
  par_salle: DoorOpen,
};

const ACCENTS: Record<ReportType, string> = {
  inventaire: "text-primary bg-primary/15",
  a_remplacer: "text-[oklch(0.64_0.24_27)] bg-[oklch(0.64_0.24_27_/_0.12)]",
  valorisation: "text-[oklch(0.75_0.18_150)] bg-[oklch(0.75_0.18_150_/_0.12)]",
  mouvements: "text-accent bg-accent/15",
  par_utilisateur: "text-[oklch(0.70_0.22_300)] bg-[oklch(0.70_0.22_300_/_0.12)]",
  par_salle: "text-[oklch(0.82_0.16_85)] bg-[oklch(0.82_0.16_85_/_0.12)]",
};

export function ReportsManager({ sites, rooms, users, lang = "fr" }: Props) {
  const t = React.useMemo(() => getT(lang), [lang]);
  const [openType, setOpenType] = React.useState<ReportType | null>(null);
  const [generating, setGenerating] = React.useState<ReportType | null>(null);

  async function handleGenerate(type: ReportType, filters: ReportFilters, extras?: { groupedByService?: boolean }) {
    setGenerating(type);
    try {
      const res = await fetch(`/api/reports/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters, ...(extras ?? {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erreur inconnue" }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapport-${type.replace(/_/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(t("reports.toast_success_title"), {
        description: t("reports.toast_success_desc", { type: REPORT_CATALOG[type].title[lang] }),
      });
      setOpenType(null);
    } catch (e) {
      toast.error(t("common.failed"), { description: String(e) });
    } finally {
      setGenerating(null);
    }
  }

  const cards: ReportType[] = [
    "inventaire",
    "a_remplacer",
    "valorisation",
    "mouvements",
    "par_utilisateur",
    "par_salle",
  ];

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((type) => {
          const meta = REPORT_CATALOG[type];
          const Icon = ICONS[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => setOpenType(type)}
              disabled={generating !== null}
              className="text-left block disabled:opacity-50 transition-transform hover:-translate-y-0.5"
            >
              <GlassCard interactive className="p-6 h-full">
                <div className={cn("inline-flex size-11 items-center justify-center rounded-xl mb-4", ACCENTS[type])}>
                  <Icon className="size-5" />
                </div>
                <h3 className="font-display text-lg font-semibold mb-1">
                  {meta.title[lang]}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {meta.description[lang]}
                </p>
                <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {generating === type ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      {t("reports.generating")}
                    </>
                  ) : (
                    <>
                      <Download className="size-3.5" />
                      {t("reports.generate_pdf")}
                    </>
                  )}
                </div>
              </GlassCard>
            </button>
          );
        })}
      </div>

      {openType && (
        <ReportModal
          type={openType}
          sites={sites}
          rooms={rooms}
          users={users}
          lang={lang}
          t={t}
          onClose={() => setOpenType(null)}
          onGenerate={(filters, extras) => handleGenerate(openType, filters, extras)}
          generating={generating === openType}
        />
      )}
    </>
  );
}

/* ============================================================
   MODAL : filtres spécifiques au type de rapport
   ============================================================ */

function ReportModal({
  type,
  sites,
  rooms,
  users,
  lang,
  t,
  onClose,
  onGenerate,
  generating,
}: {
  type: ReportType;
  sites: Site[];
  rooms: Room[];
  users: AppUser[];
  lang: Lang;
  t: ReturnType<typeof getT>;
  onClose: () => void;
  onGenerate: (filters: ReportFilters, extras?: { groupedByService?: boolean }) => void;
  generating: boolean;
}) {
  const meta = REPORT_CATALOG[type];
  const [siteId, setSiteId] = React.useState<string>("");
  const [roomId, setRoomId] = React.useState<string>("");
  const [materialType, setMaterialType] = React.useState<string>("");
  const [stateFilter, setStateFilter] = React.useState<string>("");
  const [maxScore, setMaxScore] = React.useState<number>(meta.defaultFilters.maxScore ?? 40);
  const [dateFrom, setDateFrom] = React.useState<string>("");
  const [dateTo, setDateTo] = React.useState<string>("");
  const [movementType, setMovementType] = React.useState<string>("");
  const [groupBy, setGroupBy] = React.useState<"user" | "service">("user");
  const [assignedTo, setAssignedTo] = React.useState<string>("");
  const [service, setService] = React.useState<string>("");

  const availableRooms = siteId ? rooms.filter((r) => r.siteId === siteId) : rooms;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const filters: ReportFilters = {};
    if (siteId) filters.siteId = siteId;
    if (roomId) filters.roomId = roomId;
    if (materialType) filters.materialType = materialType as MaterialType;
    if (stateFilter) filters.state = stateFilter as MaterialState;
    if (type === "a_remplacer") filters.maxScore = maxScore;
    if (type === "mouvements") {
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;
      if (movementType) filters.movementType = movementType as MovementType;
    }
    if (type === "par_utilisateur") {
      if (groupBy === "service" && service) filters.service = service;
      if (groupBy === "user" && assignedTo) filters.assignedTo = assignedTo;
    }
    onGenerate(filters, { groupedByService: groupBy === "service" });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in overflow-y-auto"
      onClick={() => !generating && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-3xl glass-strong border-glass-border p-6 shadow-2xl animate-in zoom-in-95 duration-200 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h3 className="font-display text-lg font-semibold">{meta.title[lang]}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{meta.description[lang]}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3">
          {/* par_salle : requiert siteId + roomId en priorité */}
          {type === "par_salle" && (
            <>
              <Field label={t("material_form.field_site")}>
                <Select value={siteId} onChange={(e) => { setSiteId(e.target.value); setRoomId(""); }} required>
                  <option value="">—</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </Select>
              </Field>
              <Field label={t("material_form.field_room")}>
                <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} required disabled={!siteId}>
                  <option value="">—</option>
                  {availableRooms.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          {/* inventaire / valorisation : filtres communs site/salle/type/état */}
          {(type === "inventaire" || type === "valorisation") && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("material_form.field_site")}>
                  <Select value={siteId} onChange={(e) => { setSiteId(e.target.value); setRoomId(""); }}>
                    <option value="">{t("materials_list.filter_all_sites")}</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("material_form.field_room")}>
                  <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} disabled={!siteId}>
                    <option value="">{lang === "it" ? "Tutte le sale" : "Toutes les salles"}</option>
                    {availableRooms.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label={t("material_form.field_type")}>
                <Select value={materialType} onChange={(e) => setMaterialType(e.target.value)}>
                  <option value="">{t("materials_list.filter_all_types")}</option>
                  {(Object.keys(MATERIAL_TYPE_LABELS) as (keyof typeof MATERIAL_TYPE_LABELS)[]).map((tp) => (
                    <option key={tp} value={tp}>{MATERIAL_TYPE_LABELS[tp][lang]}</option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          {/* a_remplacer : seuil de score */}
          {type === "a_remplacer" && (
            <>
              <Field label={lang === "it" ? "Soglia di punteggio (≤)" : "Seuil de score (≤)"}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={maxScore}
                  onChange={(e) => setMaxScore(Number(e.target.value))}
                  className="w-full rounded-xl glass border px-3.5 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {lang === "it"
                    ? "Soglia standard : 40 (critici). Abbassa per vedere solo i più vecchi."
                    : "Seuil standard : 40 (critiques). Abaisse pour ne voir que les plus vieux."}
                </p>
              </Field>
              <Field label={t("material_form.field_site")}>
                <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  <option value="">{t("materials_list.filter_all_sites")}</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          {/* mouvements : date range */}
          {type === "mouvements" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={lang === "it" ? "Dal" : "Du"}>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full rounded-xl glass border px-3.5 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </Field>
                <Field label={lang === "it" ? "Al" : "Au"}>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full rounded-xl glass border px-3.5 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </Field>
              </div>
              <Field label={lang === "it" ? "Tipo di movimento" : "Type de mouvement"}>
                <Select value={movementType} onChange={(e) => setMovementType(e.target.value)}>
                  <option value="">{t("movements.filter_all")}</option>
                  <option value="creation">{t("movement_types.creation")}</option>
                  <option value="transfert_site">{t("movement_types.transfert_site")}</option>
                  <option value="transfert_salle">{t("movement_types.transfert_salle")}</option>
                  <option value="transfert_utilisateur">{t("movement_types.transfert_utilisateur")}</option>
                  <option value="reparation">{t("movement_types.reparation")}</option>
                  <option value="mise_au_rebut">{t("movement_types.mise_au_rebut")}</option>
                  <option value="restauration">{t("movement_types.restauration")}</option>
                </Select>
              </Field>
            </>
          )}

          {/* par_utilisateur : choix groupe-par + filtre */}
          {type === "par_utilisateur" && (
            <>
              <Field label={lang === "it" ? "Raggruppa per" : "Grouper par"}>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGroupBy("user")}
                    className={cn(
                      "flex-1 h-10 rounded-xl border text-sm font-medium",
                      groupBy === "user"
                        ? "bg-primary/12 text-primary border-primary/30"
                        : "glass border-glass-border text-muted-foreground",
                    )}
                  >
                    {lang === "it" ? "Persona" : "Personne"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupBy("service")}
                    className={cn(
                      "flex-1 h-10 rounded-xl border text-sm font-medium",
                      groupBy === "service"
                        ? "bg-primary/12 text-primary border-primary/30"
                        : "glass border-glass-border text-muted-foreground",
                    )}
                  >
                    {lang === "it" ? "Reparto" : "Service"}
                  </button>
                </div>
              </Field>

              {groupBy === "user" ? (
                <Field label={lang === "it" ? "Filtra per persona (facoltativo)" : "Filtrer par personne (optionnel)"}>
                  <input
                    type="text"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    placeholder={lang === "it" ? "Es: Mario Rossi" : "Ex: Max Rafaliarison"}
                    className="w-full rounded-xl glass border px-3.5 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {lang === "it" ? "Vuoto = tutte le persone." : "Vide = toutes les personnes."}
                  </p>
                </Field>
              ) : (
                <Field label={lang === "it" ? "Filtra per reparto (facoltativo)" : "Filtrer par service (optionnel)"}>
                  <input
                    type="text"
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    placeholder={lang === "it" ? "Es: Medico, Amministrazione" : "Ex: Médical, Administration"}
                    className="w-full rounded-xl glass border px-3.5 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </Field>
              )}
            </>
          )}
        </div>

        <div className="mt-6 flex gap-2 justify-end">
          <GlassButton type="button" variant="glass" size="sm" onClick={onClose} disabled={generating}>
            {t("common.cancel")}
          </GlassButton>
          <GlassButton type="submit" variant="brand" size="sm" disabled={generating}>
            {generating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            {t("reports.generate_pdf")}
          </GlassButton>
        </div>
      </form>
    </div>
  );
}

/* ============================================================
   UI primitives internes
   ============================================================ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full rounded-xl glass border px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
    >
      {props.children}
    </select>
  );
}
