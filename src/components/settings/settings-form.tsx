"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import {
  Globe, Moon, Sun, KeyRound, Loader2, Check, Calendar, Mail,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { cn } from "@/lib/utils";
import { getT, type Lang } from "@/lib/i18n";
import type { AppUser } from "@/types";
import { ROLE_LABELS } from "@/types";

import {
  updateMyLanguageAction,
  changeMyPasswordAction,
} from "./settings-actions";

interface Props {
  user: AppUser;
}

export function SettingsForm({ user }: Props) {
  const router = useRouter();
  const { update } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const [lang, setLang] = React.useState<Lang>(user.lang);
  const [savingLang, setSavingLang] = React.useState(false);
  const t = React.useMemo(() => getT(lang), [lang]);

  async function handleLangChange(newLang: Lang) {
    if (newLang === lang) return;
    setSavingLang(true);
    try {
      const result = await updateMyLanguageAction(newLang);
      if (result.ok) {
        setLang(newLang);
        // MàJ côté client du JWT (trigger=update)
        await update({ lang: newLang });
        toast.success(getT(newLang)("settings.lang_success"), {
          description: getT(newLang)("settings.lang_relogin_hint"),
        });
        router.refresh();
      } else {
        toast.error("Erreur", { description: result.error });
      }
    } catch (e) {
      toast.error("Erreur", { description: String(e) });
    } finally {
      setSavingLang(false);
    }
  }

  const isDark = mounted ? theme === "dark" : true;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Langue */}
      <GlassCard className="p-6">
        <div className="flex items-start gap-3">
          <div className="inline-flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent shrink-0">
            <Globe className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-semibold">
              {t("settings.language_section")}
            </h3>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <LangChoice
                active={lang === "fr"}
                label={t("settings.language_fr")}
                flag="🇫🇷"
                loading={savingLang && lang !== "fr"}
                onClick={() => handleLangChange("fr")}
                disabled={savingLang}
              />
              <LangChoice
                active={lang === "it"}
                label={t("settings.language_it")}
                flag="🇮🇹"
                loading={savingLang && lang !== "it"}
                onClick={() => handleLangChange("it")}
                disabled={savingLang}
              />
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {t("settings.lang_relogin_hint")}
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Thème */}
      <GlassCard className="p-6">
        <div className="flex items-start gap-3">
          <div className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary shrink-0">
            {isDark ? <Moon className="size-5" /> : <Sun className="size-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-semibold">
              {t("settings.theme_section")}
            </h3>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <ThemeChoice
                active={isDark}
                icon={<Moon className="size-4" />}
                label={t("settings.theme_dark")}
                onClick={() => setTheme("dark")}
              />
              <ThemeChoice
                active={!isDark}
                icon={<Sun className="size-4" />}
                label={t("settings.theme_light")}
                onClick={() => setTheme("light")}
              />
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {t("settings.theme_desc")}
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Mot de passe */}
      <PasswordSection t={t} />

      {/* Mon compte */}
      <AccountCard user={user} t={t} lang={lang} />
    </div>
  );
}

function LangChoice({
  active,
  label,
  flag,
  loading,
  onClick,
  disabled,
}: {
  active: boolean;
  label: string;
  flag: string;
  loading: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "relative flex items-center gap-3 rounded-2xl border px-4 h-14 transition-all text-left",
        active
          ? "border-primary/50 bg-primary/8 text-foreground"
          : "border-glass-border bg-white/3 text-muted-foreground hover:bg-white/6",
        "disabled:opacity-60",
      )}
    >
      <span className="text-2xl leading-none">{flag}</span>
      <span className="flex-1 font-medium text-sm">{label}</span>
      {loading ? (
        <Loader2 className="size-4 animate-spin text-primary" />
      ) : active ? (
        <Check className="size-4 text-primary" />
      ) : null}
    </button>
  );
}

function ThemeChoice({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex items-center gap-3 rounded-2xl border px-4 h-14 transition-all text-left",
        active
          ? "border-primary/50 bg-primary/8 text-foreground"
          : "border-glass-border bg-white/3 text-muted-foreground hover:bg-white/6",
      )}
    >
      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-white/5">
        {icon}
      </span>
      <span className="flex-1 font-medium text-sm">{label}</span>
      {active && <Check className="size-4 text-primary" />}
    </button>
  );
}

function PasswordSection({ t }: { t: ReturnType<typeof getT> }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      const result = await changeMyPasswordAction(current, next);
      if (result.ok) {
        toast.success(t("settings.password_success"));
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        setError(result.error ?? "Erreur inconnue");
        toast.error("Erreur", { description: result.error });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-start gap-3">
        <div className="inline-flex size-10 items-center justify-center rounded-xl bg-[oklch(0.82_0.16_85_/_0.15)] text-[oklch(0.82_0.16_85)] shrink-0">
          <KeyRound className="size-5" />
        </div>
        <form onSubmit={handleSubmit} className="flex-1 min-w-0 space-y-3">
          <h3 className="font-display text-lg font-semibold">
            {t("settings.password_section")}
          </h3>

          <PwdInput
            label={t("settings.password_current")}
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
          />
          <PwdInput
            label={t("settings.password_new")}
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            hint={t("settings.password_rule")}
          />
          <PwdInput
            label={t("settings.password_confirm")}
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />

          {error && (
            <div className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-primary">
              {error}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <GlassButton
              type="submit"
              variant="brand"
              size="sm"
              disabled={loading || !current || !next || !confirm}
            >
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              {t("settings.password_submit")}
            </GlassButton>
          </div>
        </form>
      </div>
    </GlassCard>
  );
}

function PwdInput({
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
        {label}
      </span>
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl glass border px-3.5 h-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </label>
  );
}

function AccountCard({
  user,
  t,
  lang,
}: {
  user: AppUser;
  t: ReturnType<typeof getT>;
  lang: Lang;
}) {
  return (
    <GlassCard className="p-6">
      <div className="flex items-start gap-3">
        <div className="inline-flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground shrink-0">
          <Shield className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-lg font-semibold">
            {t("settings.account_section")}
          </h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
            <AccountField
              icon={<Mail className="size-3.5" />}
              label={t("settings.account_email")}
              value={user.email}
            />
            <AccountField
              icon={<Shield className="size-3.5" />}
              label={t("settings.account_role")}
              value={ROLE_LABELS[user.role][lang]}
            />
            <AccountField
              icon={<Calendar className="size-3.5" />}
              label={t("settings.account_created")}
              value={fmtDate(user.createdAt)}
            />
            <AccountField
              icon={<Calendar className="size-3.5" />}
              label={t("settings.account_last_login")}
              value={user.lastLoginAt ? fmtDate(user.lastLoginAt) : "—"}
            />
          </dl>
        </div>
      </div>
    </GlassCard>
  );
}

function AccountField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
