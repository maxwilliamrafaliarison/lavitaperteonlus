"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus, MoreVertical, Pencil, KeyRound, UserCheck, UserX,
  Loader2, X, Shield, Wrench, Briefcase, Package,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { cn } from "@/lib/utils";
import type { AppUser, UserRole } from "@/types";
import { getT, type Lang, type TFn } from "@/lib/i18n";

import {
  inviteUserAction,
  toggleActiveUserAction,
  updateUserAction,
  resetPasswordAction,
} from "./user-actions";

interface Props {
  users: AppUser[];
  currentUserId: string;
  lang?: Lang;
}

const ROLE_META: Record<UserRole, { icon: LucideIcon; tone: string }> = {
  admin: { icon: Shield, tone: "bg-primary/15 text-primary border-primary/30" },
  informaticien: {
    icon: Wrench,
    tone: "bg-accent/15 text-accent border-accent/30",
  },
  direction: {
    icon: Briefcase,
    tone: "bg-[oklch(0.70_0.22_300_/_0.15)] text-[oklch(0.70_0.22_300)] border-[oklch(0.70_0.22_300_/_0.3)]",
  },
  logistique: {
    icon: Package,
    tone: "bg-[oklch(0.82_0.16_85_/_0.15)] text-[oklch(0.82_0.16_85)] border-[oklch(0.82_0.16_85_/_0.3)]",
  },
};

type ModalMode = null | "invite" | { kind: "edit" | "reset"; user: AppUser };

export function UsersManager({
  users: initialUsers,
  currentUserId,
  lang = "fr",
}: Props) {
  const router = useRouter();
  const t = React.useMemo(() => getT(lang), [lang]);
  const [users, setUsers] = React.useState(initialUsers);
  const [modal, setModal] = React.useState<ModalMode>(null);
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  // Ferme le menu contextuel au click extérieur
  React.useEffect(() => {
    function close() {
      setOpenMenuId(null);
    }
    if (openMenuId) {
      document.addEventListener("click", close);
      return () => document.removeEventListener("click", close);
    }
  }, [openMenuId]);

  async function handleToggle(user: AppUser) {
    if (user.id === currentUserId) {
      toast.error("Action impossible", {
        description: t("users.action_self_deactivate"),
      });
      return;
    }
    setLoadingId(user.id);
    try {
      const result = await toggleActiveUserAction(user.id);
      if (result.ok && result.user) {
        setUsers((prev) => prev.map((u) => (u.id === user.id ? result.user! : u)));
        toast.success(
          result.user.active
            ? t("users.toggle_activated")
            : t("users.toggle_deactivated"),
        );
        router.refresh();
      } else {
        toast.error("Échec", { description: result.error });
      }
    } finally {
      setLoadingId(null);
      setOpenMenuId(null);
    }
  }

  const activeCount = users.filter((u) => u.active).length;

  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {t("users.count_active", {
            n: users.length,
            p: users.length > 1 ? "s" : "",
            active: activeCount,
            ap: activeCount > 1 ? "s" : "",
          })}
        </p>
        <GlassButton
          type="button"
          variant="brand"
          size="sm"
          onClick={() => setModal("invite")}
        >
          <UserPlus className="size-3.5" />
          {t("actions.invite_user")}
        </GlassButton>
      </div>

      <GlassCard className="p-2 overflow-hidden">
        <div className="divide-y divide-glass-border">
          {users.map((u) => {
            const meta = ROLE_META[u.role];
            const Icon = meta.icon;
            const isSelf = u.id === currentUserId;
            const busy = loadingId === u.id;

            return (
              <div
                key={u.id}
                className={cn(
                  "flex items-center gap-4 px-4 py-3 rounded-2xl transition-colors",
                  !u.active && "opacity-60",
                )}
              >
                <div className="inline-flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 text-sm font-semibold font-display shrink-0">
                  {getInitials(u.name || u.email)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">
                      {u.name || u.email}
                    </span>
                    {isSelf && (
                      <span className="text-[10px] uppercase tracking-wider text-accent bg-accent/10 border border-accent/30 rounded-full px-1.5 py-0.5">
                        {t("users.self_badge")}
                      </span>
                    )}
                    {!u.active && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                        {t("users.inactive_badge")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground/80 font-mono">
                    {u.lastLoginAt ? (
                      <span>
                        {t("users.last_login")} {fmtDate(u.lastLoginAt, lang)}
                      </span>
                    ) : (
                      <span className="italic">{t("users.never_logged")}</span>
                    )}
                  </div>
                </div>

                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 h-7 text-[11px] font-medium shrink-0",
                    meta.tone,
                  )}
                >
                  <Icon className="size-3" />
                  {t(`roles.${u.role}`)}
                </span>

                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono shrink-0 hidden md:inline">
                  {u.lang.toUpperCase()}
                </span>

                {/* Actions menu */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === u.id ? null : u.id);
                    }}
                    disabled={busy}
                    className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-white/8 transition-colors disabled:opacity-50"
                    aria-label={t("common.actions")}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <MoreVertical className="size-4" />
                    )}
                  </button>

                  {openMenuId === u.id && (
                    <div
                      className="absolute right-0 top-full mt-1 w-52 rounded-2xl glass-strong border border-glass-border shadow-2xl py-1.5 z-20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MenuItem
                        icon={<Pencil className="size-3.5" />}
                        label={t("actions.edit")}
                        onClick={() => {
                          setModal({ kind: "edit", user: u });
                          setOpenMenuId(null);
                        }}
                      />
                      <MenuItem
                        icon={<KeyRound className="size-3.5" />}
                        label={t("actions.reset_password")}
                        onClick={() => {
                          setModal({ kind: "reset", user: u });
                          setOpenMenuId(null);
                        }}
                      />
                      {!isSelf && (
                        <MenuItem
                          icon={
                            u.active ? (
                              <UserX className="size-3.5" />
                            ) : (
                              <UserCheck className="size-3.5" />
                            )
                          }
                          label={
                            u.active
                              ? t("actions.deactivate")
                              : t("actions.activate")
                          }
                          onClick={() => handleToggle(u)}
                          destructive={u.active}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {modal === "invite" && (
        <InviteModal
          t={t}
          onClose={() => setModal(null)}
          onSuccess={(user) => {
            setUsers((prev) => [...prev, user]);
            setModal(null);
            router.refresh();
          }}
        />
      )}
      {modal && typeof modal === "object" && modal.kind === "edit" && (
        <EditUserModal
          t={t}
          user={modal.user}
          onClose={() => setModal(null)}
          onSuccess={(user) => {
            setUsers((prev) => prev.map((u) => (u.id === user.id ? user : u)));
            setModal(null);
            router.refresh();
          }}
        />
      )}
      {modal && typeof modal === "object" && modal.kind === "reset" && (
        <ResetPasswordModal
          t={t}
          user={modal.user}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/* ============================================================
   MODALS
   ============================================================ */

function InviteModal({
  t,
  onClose,
  onSuccess,
}: {
  t: TFn;
  onClose: () => void;
  onSuccess: (user: AppUser) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    try {
      const result = await inviteUserAction(formData);
      if (result.ok && result.user) {
        toast.success(t("users.invite_success"), {
          description: t("users.invite_success_desc", {
            email: result.user.email,
          }),
        });
        onSuccess(result.user);
      } else {
        setError(result.error ?? t("material_form.error_generic"));
        toast.error("Échec", { description: result.error });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={t("users.modal_invite_title")}
      onClose={onClose}
      disabled={loading}
      t={t}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t("users.field_email")}>
          <input
            name="email"
            type="email"
            required
            placeholder={t("users.field_email_placeholder")}
            className="w-full rounded-xl glass border px-3.5 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        <Field label={t("users.field_name")}>
          <input
            name="name"
            type="text"
            required
            placeholder={t("users.field_name_placeholder")}
            className="w-full rounded-xl glass border px-3.5 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("users.field_role")}>
            <select
              name="role"
              required
              defaultValue="logistique"
              className="w-full rounded-xl glass border px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="admin">{t("roles.admin")}</option>
              <option value="informaticien">{t("roles.informaticien")}</option>
              <option value="direction">{t("roles.direction")}</option>
              <option value="logistique">{t("roles.logistique")}</option>
            </select>
          </Field>
          <Field label={t("users.field_lang")}>
            <select
              name="lang"
              required
              defaultValue="fr"
              className="w-full rounded-xl glass border px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="fr">{t("settings.language_fr")}</option>
              <option value="it">{t("settings.language_it")}</option>
            </select>
          </Field>
        </div>

        <Field label={t("users.field_password_initial")}>
          <input
            name="password"
            type="text"
            required
            minLength={8}
            placeholder={t("users.password_placeholder")}
            className="w-full rounded-xl glass border px-3.5 h-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("users.password_initial_hint")}
          </p>
        </Field>

        {error && <ErrorBanner message={error} />}

        <ModalActions
          loading={loading}
          onCancel={onClose}
          submitLabel={t("users.submit_invite")}
          t={t}
        />
      </form>
    </Modal>
  );
}

function EditUserModal({
  t,
  user,
  onClose,
  onSuccess,
}: {
  t: TFn;
  user: AppUser;
  onClose: () => void;
  onSuccess: (user: AppUser) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    try {
      const result = await updateUserAction(user.id, formData);
      if (result.ok && result.user) {
        toast.success(t("users.update_success"));
        onSuccess(result.user);
      } else {
        setError(result.error ?? t("material_form.error_generic"));
        toast.error("Échec", { description: result.error });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={t("users.modal_edit_title", { email: user.email })}
      onClose={onClose}
      disabled={loading}
      t={t}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t("users.field_name")}>
          <input
            name="name"
            type="text"
            defaultValue={user.name}
            required
            className="w-full rounded-xl glass border px-3.5 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("users.field_role")}>
            <select
              name="role"
              defaultValue={user.role}
              required
              className="w-full rounded-xl glass border px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="admin">{t("roles.admin")}</option>
              <option value="informaticien">{t("roles.informaticien")}</option>
              <option value="direction">{t("roles.direction")}</option>
              <option value="logistique">{t("roles.logistique")}</option>
            </select>
          </Field>
          <Field label={t("users.field_lang")}>
            <select
              name="lang"
              defaultValue={user.lang}
              required
              className="w-full rounded-xl glass border px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="fr">{t("settings.language_fr")}</option>
              <option value="it">{t("settings.language_it")}</option>
            </select>
          </Field>
        </div>

        {error && <ErrorBanner message={error} />}

        <ModalActions
          loading={loading}
          onCancel={onClose}
          submitLabel={t("users.submit_save")}
          t={t}
        />
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  t,
  user,
  onClose,
  onSuccess,
}: {
  t: TFn;
  user: AppUser;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await resetPasswordAction(user.id, password);
      if (result.ok) {
        toast.success(t("users.reset_success"), {
          description: t("users.reset_success_desc", { email: user.email }),
        });
        onSuccess();
      } else {
        setError(result.error ?? t("material_form.error_generic"));
        toast.error("Échec", { description: result.error });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={t("users.modal_reset_title", { email: user.email })}
      onClose={onClose}
      disabled={loading}
      t={t}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
          {t("users.reset_warning")}
        </div>

        <Field label={t("users.field_password_new")}>
          <input
            name="password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder={t("users.password_placeholder")}
            className="w-full rounded-xl glass border px-3.5 h-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        {error && <ErrorBanner message={error} />}

        <ModalActions
          loading={loading}
          onCancel={onClose}
          submitLabel={t("users.submit_reset")}
          t={t}
        />
      </form>
    </Modal>
  );
}

/* ============================================================
   UI PRIMITIVES internes
   ============================================================ */

function Modal({
  title,
  children,
  onClose,
  disabled,
  t,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  disabled?: boolean;
  t: TFn;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in overflow-y-auto"
      onClick={() => !disabled && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-3xl glass-strong border-glass-border p-6 shadow-2xl animate-in zoom-in-95 duration-200 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

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

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-primary">
      {message}
    </div>
  );
}

function ModalActions({
  loading,
  onCancel,
  submitLabel,
  t,
}: {
  loading: boolean;
  onCancel: () => void;
  submitLabel: string;
  t: TFn;
}) {
  return (
    <div className="flex gap-2 justify-end pt-2">
      <GlassButton
        type="button"
        variant="glass"
        size="sm"
        onClick={onCancel}
        disabled={loading}
      >
        {t("common.cancel")}
      </GlassButton>
      <GlassButton type="submit" variant="brand" size="sm" disabled={loading}>
        {loading && <Loader2 className="size-3.5 animate-spin" />}
        {submitLabel}
      </GlassButton>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/8 transition-colors",
        destructive && "text-destructive",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/* ============================================================
   HELPERS
   ============================================================ */

function getInitials(name: string): string {
  return name
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function fmtDate(iso: string, lang: Lang): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(lang === "it" ? "it-IT" : "fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
