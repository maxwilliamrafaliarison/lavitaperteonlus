"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Lock, Mail, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LanguageSwitcher, type Lang } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getStoredLang, detectBrowserLang } from "@/lib/i18n/persist";
import fr from "@/lib/i18n/messages/fr.json";
import it from "@/lib/i18n/messages/it.json";

import { loginAction, type LoginState } from "./actions";

const messages = { fr, it } as const;

function SubmitButton({ label, submittingLabel }: { label: string; submittingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <GlassButton
      variant="brand"
      size="lg"
      shimmer={!pending}
      type="submit"
      disabled={pending}
      className="w-full"
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {submittingLabel}
        </>
      ) : (
        label
      )}
    </GlassButton>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [lang, setLang] = React.useState<Lang>("fr");
  const [showPassword, setShowPassword] = React.useState(false);
  const t = messages[lang];

  // Initialise depuis cookie/localStorage ou langue du navigateur
  React.useEffect(() => {
    const stored = getStoredLang();
    if (stored) setLang(stored);
    else setLang(detectBrowserLang());
  }, []);

  const [state, formAction] = React.useActionState<LoginState | undefined, FormData>(
    loginAction,
    undefined,
  );

  React.useEffect(() => {
    if (state?.ok) {
      router.push("/dashboard");
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Image de fond (cohérence avec landing) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-20">
        <Image
          src="/logo/centre-rex.jpg"
          alt=""
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
      </div>
      {/* Voile flouté léger : on garde l'atmosphère sans le noir lourd
          de la landing — le glass card du formulaire prend le relais */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-background/65 backdrop-blur-2xl"
      />
      {/* Halos brand par-dessus le flou pour la couleur */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-primary/15 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-accent/12 blur-[120px]" />
      </div>

      <header className="relative z-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 md:px-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            {t.common.back}
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher value={lang} onChange={setLang} persist />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main-content" className="relative z-10 flex min-h-[calc(100vh-96px)] items-center justify-center px-6 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          <div className="mb-10 flex justify-center">
            <BrandLogo size={56} />
          </div>

          <GlassCard intensity="strong" glow="brand" className="p-8 md:p-10">
            <div className="text-center">
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                {t.login.title}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t.login.subtitle}
              </p>
            </div>

            <form action={formAction} className="mt-8 space-y-5">
              <p className="text-[11px] text-muted-foreground">
                <span aria-hidden="true" className="text-primary">*</span>{" "}
                {t.a11y.required_legend}
              </p>
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {t.login.email}{" "}
                  <span aria-label={t.a11y.required_indicator} className="text-primary not-italic">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder={t.login.email_placeholder}
                    className="w-full h-12 rounded-2xl glass border pl-11 pr-4 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {t.login.password}{" "}
                  <span aria-label={t.a11y.required_indicator} className="text-primary not-italic">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder={t.login.password_placeholder}
                    className="w-full h-12 rounded-2xl glass border pl-11 pr-12 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? t.login.password_hide : t.login.password_show}
                    aria-pressed={showPassword}
                    tabIndex={-1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {state?.error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                  <span>{state.error}</span>
                </div>
              )}

              <SubmitButton label={t.login.submit} submittingLabel={t.login.submitting} />

              <div className="text-center space-y-2">
                <Link
                  href="/setup"
                  className="block text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t.login.first_setup}
                </Link>
              </div>
            </form>
          </GlassCard>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            {t.login.footer}
          </p>
        </motion.div>
      </main>
    </div>
  );
}
