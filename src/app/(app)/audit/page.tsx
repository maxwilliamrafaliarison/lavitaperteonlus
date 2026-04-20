import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
  ScrollText, Eye, LogIn, LogOut, Pencil, Trash2, RotateCcw, UserPlus, Filter,
} from "lucide-react";

import { AppTopbar } from "@/components/layout/app-topbar";
import { GlassCard } from "@/components/glass/glass-card";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { listAuditLogs } from "@/lib/sheets/audit";
import { safe, isConfigError } from "@/lib/sheets/safe";
import type { AuditLog, AuditLogAction } from "@/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ACTION_META: Record<
  AuditLogAction,
  { label: string; icon: typeof Eye; tone: "primary" | "success" | "warning" | "muted" }
> = {
  view_password: { label: "MDP consulté", icon: Eye, tone: "primary" },
  view_material: { label: "Fiche consultée", icon: Eye, tone: "muted" },
  edit_material: { label: "Modification", icon: Pencil, tone: "warning" },
  delete_material: { label: "Suppression", icon: Trash2, tone: "primary" },
  restore_material: { label: "Restauration", icon: RotateCcw, tone: "success" },
  invite_user: { label: "Utilisateur invité", icon: UserPlus, tone: "success" },
  login: { label: "Connexion", icon: LogIn, tone: "muted" },
  logout: { label: "Déconnexion", icon: LogOut, tone: "muted" },
};

const TONE_STYLES = {
  primary: "bg-primary/12 text-primary border-primary/30",
  success:
    "bg-[oklch(0.75_0.18_150_/_0.12)] text-[oklch(0.75_0.18_150)] border-[oklch(0.75_0.18_150_/_0.3)]",
  warning:
    "bg-[oklch(0.82_0.16_85_/_0.12)] text-[oklch(0.82_0.16_85)] border-[oklch(0.82_0.16_85_/_0.3)]",
  muted: "bg-muted text-muted-foreground border-glass-border",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const session = await auth();
  if (session?.user.role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const filterAction = sp.action as AuditLogAction | undefined;

  const logsRes = await safe<AuditLog[]>(
    () => listAuditLogs({ action: filterAction, limit: 200 }),
    [],
  );
  const logs = logsRes.data;
  const configIssue = isConfigError(logsRes.error);

  // Compteur par action (sur les 200 derniers)
  const counts = logs.reduce(
    (acc, l) => {
      acc[l.action] = (acc[l.action] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <>
      <AppTopbar title="Journal d'audit" />

      <main className="flex-1 p-6 md:p-10 space-y-8">
        <header className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Sécurité & traçabilité
          </p>
          <h2 className="mt-2 font-display text-3xl md:text-4xl font-semibold tracking-tight">
            Journal d&apos;audit
          </h2>
          <p className="mt-2 text-muted-foreground">
            Consultations de mots de passe, modifications du parc, connexions —
            les 200 dernières entrées. Réservé à l&apos;administrateur.
          </p>
        </header>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
            <Filter className="size-3.5" />
            Filtrer :
          </span>
          <FilterChip
            href="/audit"
            label="Tout"
            active={!filterAction}
            count={Object.values(counts).reduce((a, b) => a + b, 0)}
          />
          <FilterChip
            href="/audit?action=view_password"
            label="MDP consultés"
            active={filterAction === "view_password"}
            count={counts["view_password"]}
            tone="primary"
          />
          <FilterChip
            href="/audit?action=login"
            label="Connexions"
            active={filterAction === "login"}
            count={counts["login"]}
          />
          <FilterChip
            href="/audit?action=edit_material"
            label="Modifications"
            active={filterAction === "edit_material"}
            count={counts["edit_material"]}
            tone="warning"
          />
          <FilterChip
            href="/audit?action=delete_material"
            label="Suppressions"
            active={filterAction === "delete_material"}
            count={counts["delete_material"]}
            tone="primary"
          />
        </div>

        {logs.length === 0 ? (
          <SheetEmptyState
            title="Aucun événement"
            description={
              filterAction
                ? "Aucun événement avec ce filtre."
                : "Le journal est vide pour l'instant — il se remplira au fur et à mesure de l'activité."
            }
            configError={configIssue}
          />
        ) : (
          <GlassCard className="overflow-hidden p-0">
            <div className="divide-y divide-glass-border">
              {logs.map((log) => {
                const meta = ACTION_META[log.action] ?? ACTION_META.view_material;
                const Icon = meta.icon;
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-4 px-5 py-4 hover:bg-white/3 transition-colors"
                  >
                    <div
                      className={cn(
                        "inline-flex size-9 items-center justify-center rounded-xl border shrink-0",
                        TONE_STYLES[meta.tone],
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{meta.label}</span>
                        <span className="text-xs text-muted-foreground">par</span>
                        <span className="text-xs font-medium">{log.userEmail}</span>
                      </div>
                      {log.details && (
                        <p className="text-xs text-muted-foreground mt-1 truncate" title={log.details}>
                          {log.details}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground/80 font-mono">
                        <span>{fmtDate(log.timestamp)}</span>
                        {log.targetType && log.targetId && (
                          <span className="truncate">
                            {log.targetType}: {log.targetId.slice(0, 24)}
                          </span>
                        )}
                        {log.ip && <span className="truncate">{log.ip}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {logs.length >= 200 && (
          <p className="text-center text-xs text-muted-foreground">
            Affichage des 200 entrées les plus récentes. La pagination complète
            arrivera dans une prochaine itération.
          </p>
        )}
      </main>
    </>
  );
}

function FilterChip({
  href,
  label,
  active,
  count,
  tone = "muted",
}: {
  href: string;
  label: string;
  active: boolean;
  count?: number;
  tone?: "muted" | "primary" | "warning";
}) {
  const toneCls =
    tone === "primary"
      ? "border-primary/30 bg-primary/10 text-primary"
      : tone === "warning"
        ? "border-[oklch(0.82_0.16_85_/_0.3)] bg-[oklch(0.82_0.16_85_/_0.10)] text-[oklch(0.82_0.16_85)]"
        : "border-glass-border bg-glass text-muted-foreground";

  return (
    <a
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 h-7 text-xs font-medium transition-all",
        active ? "ring-2 ring-primary/40 text-foreground" : "hover:bg-white/8",
        toneCls,
      )}
    >
      {label}
      {typeof count === "number" && count > 0 && (
        <span className="font-mono opacity-80">{count}</span>
      )}
    </a>
  );
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
