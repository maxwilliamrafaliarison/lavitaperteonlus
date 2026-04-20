import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Building2, MapPin, User as UserIcon, Calendar, Banknote,
  Cpu, MemoryStick, HardDrive, MonitorSmartphone, Wifi, Globe, Database,
  Hash, Tag, Pencil, Trash2, ArrowRightLeft, Lock, Eye, AlertCircle,
} from "lucide-react";

import { AppTopbar } from "@/components/layout/app-topbar";
import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { ObsolescenceBadge } from "@/components/materials/obsolescence-badge";
import { StateBadge } from "@/components/materials/state-badge";
import { MaterialTypeIcon } from "@/components/materials/type-icon";
import { ScoreGauge } from "@/components/materials/score-gauge";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { getMaterial } from "@/lib/sheets/materials";
import { getRoom, getSite } from "@/lib/sheets/sites";
import { listSessions } from "@/lib/sheets/sessions";
import { safe, isConfigError } from "@/lib/sheets/safe";
import { scoreObsolescence } from "@/lib/obsolescence";
import { MATERIAL_TYPE_LABELS, type Material, type Room, type Site, type MaterialSession } from "@/types";
import { SessionsManager } from "@/components/materials/sessions-manager";

export const dynamic = "force-dynamic";

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();
  const role = session?.user.role;
  const lang = session?.user.lang ?? "fr";

  const matRes = await safe<Material | null>(() => getMaterial(id), null);
  if (!matRes.data && !isConfigError(matRes.error)) notFound();

  const material = matRes.data;
  if (!material) {
    return (
      <>
        <AppTopbar title="Matériel" />
        <main className="flex-1 p-6 md:p-10">
          <div className="rounded-3xl glass border p-10 text-center max-w-2xl mx-auto">
            <AlertCircle className="size-10 mx-auto text-primary mb-4" />
            <p className="text-sm text-muted-foreground">
              {isConfigError(matRes.error)
                ? "Connexion au Google Sheet impossible. Vérifiez les variables d'environnement Vercel."
                : "Matériel introuvable."}
            </p>
          </div>
        </main>
      </>
    );
  }

  const [siteRes, roomRes, sessionsRes] = await Promise.all([
    safe<Site | null>(() => getSite(material.siteId), null),
    safe<Room | null>(() => getRoom(material.roomId), null),
    safe<MaterialSession[]>(() => listSessions({ materialId: material.id }), []),
  ]);

  const obs = scoreObsolescence(material);
  const canSeePassword = can(role, "password:reveal");
  const canEdit = can(role, "material:update");
  const canDelete = can(role, "material:delete");
  const sessions = sessionsRes.data;

  return (
    <>
      <AppTopbar title={material.designation || material.ref} />

      <main className="flex-1 p-6 md:p-10 space-y-8 max-w-7xl mx-auto w-full">
        {/* Back nav */}
        <Link
          href={
            siteRes.data && roomRes.data
              ? `/sites/${siteRes.data.id}/rooms/${roomRes.data.id}`
              : "/materials"
          }
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Retour
        </Link>

        {/* HERO */}
        <GlassCard intensity="strong" glow={obs.level === "critical" ? "brand" : "cyan"} className="p-7 md:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-5 min-w-0">
              <div className="inline-flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary border border-primary/20">
                <MaterialTypeIcon type={material.type} className="size-8" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {MATERIAL_TYPE_LABELS[material.type][lang]}
                </p>
                <h2 className="mt-1 font-display text-3xl md:text-4xl font-semibold tracking-tight break-words">
                  {material.designation || material.ref}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StateBadge state={material.state} lang={lang} />
                  <ObsolescenceBadge level={obs.level} score={obs.score} lang={lang} />
                  <span className="inline-flex items-center gap-1.5 rounded-full glass border px-2.5 h-7 text-[11px] font-mono text-muted-foreground">
                    <Hash className="size-3" />
                    {material.ref}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center md:items-end gap-3 shrink-0">
              <ScoreGauge score={obs.score} level={obs.level} size={120} />
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Score obsolescence
              </p>
            </div>
          </div>

          {/* Actions */}
          {(canEdit || canDelete) && (
            <div className="mt-7 pt-6 border-t border-glass-border flex flex-wrap gap-2">
              {canEdit && (
                <Link href={`/materials/${material.id}/edit`}>
                  <GlassButton variant="glass" size="sm">
                    <Pencil className="size-3.5" />
                    Modifier
                  </GlassButton>
                </Link>
              )}
              {canEdit && (
                <Link href={`/materials/${material.id}/transfer`}>
                  <GlassButton variant="glass" size="sm">
                    <ArrowRightLeft className="size-3.5" />
                    Transférer
                  </GlassButton>
                </Link>
              )}
              {canDelete && (
                <Link href={`/materials/${material.id}/delete`}>
                  <GlassButton variant="glass" size="sm" className="text-destructive hover:bg-destructive/10">
                    <Trash2 className="size-3.5" />
                    Supprimer
                  </GlassButton>
                </Link>
              )}
            </div>
          )}
        </GlassCard>

        {/* Reasons (if obsolescence > 0) */}
        {obs.reasons.length > 0 && (
          <GlassCard className="p-6">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <AlertCircle className="size-5 text-primary" />
              Pourquoi ce score ?
            </h3>
            <ul className="mt-4 space-y-2 text-sm">
              {obs.reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="size-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span className="text-muted-foreground">{r}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}

        {/* Two-column grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Localisation */}
          <Section title="Localisation" icon={<MapPin className="size-5" />}>
            <Field label="Site" value={siteRes.data?.name ?? "—"} icon={<Building2 className="size-4" />} />
            <Field label="Salle" value={roomRes.data?.name ?? "—"} icon={<MapPin className="size-4" />} />
            <Field label="Service" value={material.service} />
            <Field label="Affecté à" value={material.assignedTo} icon={<UserIcon className="size-4" />} />
            <Field label="Propriétaire" value={material.owner} />
          </Section>

          {/* Achat / Amortissement */}
          <Section title="Achat & finance" icon={<Banknote className="size-5" />}>
            <Field label="Date d'achat" value={material.purchaseDate} icon={<Calendar className="size-4" />} />
            <Field label="Coût (TTC)" value={material.purchasePrice ? `${material.purchasePrice.toLocaleString("fr-FR")} Ar` : undefined} />
            <Field label="Amortissement" value={material.amortization} />
            <Field label="Quantité 2025" value={material.quantity2025?.toString()} />
          </Section>

          {/* Caractéristiques techniques */}
          <Section title="Caractéristiques" icon={<Cpu className="size-5" />}>
            <Field label="Marque" value={material.brand} icon={<Tag className="size-4" />} />
            <Field label="Modèle" value={material.model} />
            <Field label="N° de série" value={material.serialNumber} className="font-mono text-xs" />
            <Field label="Système" value={material.os} icon={<MonitorSmartphone className="size-4" />} />
            <Field label="Processeur" value={material.cpu} icon={<Cpu className="size-4" />} />
            <Field label="RAM" value={material.ram} icon={<MemoryStick className="size-4" />} />
            <Field label="Stockage" value={material.storage} icon={<HardDrive className="size-4" />} />
          </Section>

          {/* Réseau */}
          <Section title="Réseau" icon={<Wifi className="size-5" />}>
            <Field label="Adresse IP" value={material.ipAddress} icon={<Globe className="size-4" />} className="font-mono text-xs" />
            <Field label="Adresse MAC" value={material.macAddress} className="font-mono text-xs" />
            <Field
              label="Internet"
              value={
                material.internetAccess === undefined
                  ? undefined
                  : material.internetAccess
                    ? "Oui"
                    : "Non"
              }
            />
            <Field
              label="Lié à la BDD"
              value={
                material.linkedToBDD === undefined
                  ? undefined
                  : material.linkedToBDD
                    ? "Oui"
                    : "Non"
              }
              icon={<Database className="size-4" />}
            />
          </Section>
        </div>

        {/* Sessions / MDP — Phase 4 */}
        <GlassCard className="p-6">
          <div className="flex items-start justify-between gap-4 mb-1">
            <div className="flex items-start gap-3">
              <div className="inline-flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Lock className="size-4" />
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold">Sessions & mots de passe</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Comptes utilisateurs configurés sur ce matériel
                </p>
              </div>
            </div>
            {canSeePassword ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 text-accent border border-accent/30 px-2.5 h-6 text-[10px] font-medium uppercase tracking-wider">
                <Eye className="size-3" />
                Accès autorisé
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground border px-2.5 h-6 text-[10px] font-medium uppercase tracking-wider">
                <Lock className="size-3" />
                Accès restreint
              </span>
            )}
          </div>

          <div className="mt-6">
            <SessionsManager
              materialId={material.id}
              sessions={sessions}
              canReveal={canSeePassword}
              canEdit={canEdit}
            />
          </div>
        </GlassCard>

        {/* Notes */}
        {material.notes && (
          <GlassCard className="p-6">
            <h3 className="font-display text-lg font-semibold mb-3">Remarques</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {material.notes}
            </p>
          </GlassCard>
        )}

        {/* Meta */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-muted-foreground/80">
          <span>Créé : {fmtDate(material.createdAt)}</span>
          <span>Mis à jour : {fmtDate(material.updatedAt)}</span>
          <span className="font-mono">ID : {material.id}</span>
        </div>
      </main>
    </>
  );
}

/* ----------------------------------------------------------- */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="inline-flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
          {icon}
        </div>
        <h3 className="font-display text-lg font-semibold">{title}</h3>
      </div>
      <dl className="space-y-3">{children}</dl>
    </GlassCard>
  );
}

function Field({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value?: string | null;
  icon?: React.ReactNode;
  className?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      {icon && <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>}
      <div className="flex-1 min-w-0">
        <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </dt>
        <dd className={`mt-0.5 text-sm font-medium ${className ?? ""}`} title={value}>
          {value}
        </dd>
      </div>
    </div>
  );
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
