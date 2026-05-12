"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Accessibility, CheckCircle2, AlertCircle, FileCheck, Mail, Calendar } from "lucide-react";

import { GlassCard } from "@/components/glass/glass-card";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LanguageSwitcher, type Lang } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getStoredLang, detectBrowserLang } from "@/lib/i18n/persist";
import fr from "@/lib/i18n/messages/fr.json";
import it from "@/lib/i18n/messages/it.json";

const messages = { fr, it } as const;

export default function AccessibilityPage() {
  const [lang, setLang] = React.useState<Lang>("fr");
  const t = messages[lang].a11y;

  React.useEffect(() => {
    const stored = getStoredLang();
    if (stored) setLang(stored);
    else setLang(detectBrowserLang());
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Halo discret */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[420px] w-[420px] rounded-full bg-primary/12 blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 h-[320px] w-[320px] rounded-full bg-accent/10 blur-[120px]" />
      </div>

      <header className="relative z-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6 md:px-10">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <BrandLogo />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher value={lang} onChange={setLang} persist />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main-content" className="relative z-10 mx-auto max-w-4xl px-6 pb-20 md:px-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t.back_home}
        </Link>

        <div className="flex items-start gap-4 mb-10">
          <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary shrink-0">
            <Accessibility className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
              {t.page_title}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground md:text-base leading-relaxed max-w-2xl">
              {t.page_intro}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* État de conformité */}
          <GlassCard className="p-6 md:p-8">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-5 text-[oklch(0.82_0.16_85)] mt-1 shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-xl font-semibold">{t.state_section}</h2>
                <p className="mt-2 text-sm">
                  <span className="font-medium text-foreground">{t.state_level}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="text-muted-foreground">{t.state_score}</span>
                </p>
                <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                  {t.state_note}
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Référentiel + méthode */}
          <div className="grid gap-6 md:grid-cols-2">
            <GlassCard className="p-6">
              <div className="flex items-start gap-3">
                <FileCheck className="size-5 text-accent mt-0.5 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <h2 className="font-display text-base font-semibold">{t.ref_section}</h2>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{t.ref_text}</p>
                </div>
              </div>
            </GlassCard>
            <GlassCard className="p-6">
              <div className="flex items-start gap-3">
                <Accessibility className="size-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <h2 className="font-display text-base font-semibold">{t.audit_section}</h2>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{t.audit_text}</p>
                  <dl className="mt-3 space-y-1 text-[11px]">
                    <div className="flex gap-2">
                      <Calendar className="size-3 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                      <dt className="text-muted-foreground">{t.audit_date_label} :</dt>
                      <dd className="font-medium">{t.audit_date_value}</dd>
                    </div>
                    <div className="flex gap-2">
                      <Calendar className="size-3 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                      <dt className="text-muted-foreground">{t.audit_update_label} :</dt>
                      <dd className="font-medium">{t.audit_update_value}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Non-conformités */}
          <GlassCard className="p-6 md:p-8">
            <div className="flex items-start gap-3">
              <AlertCircle className="size-5 text-[oklch(0.82_0.16_85)] mt-1 shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-xl font-semibold">{t.issues_section}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{t.issues_intro}</p>
                <ul className="mt-4 space-y-3 text-sm">
                  <li className="flex gap-3">
                    <span className="text-primary font-mono shrink-0 mt-0.5" aria-hidden="true">1.</span>
                    <span className="text-muted-foreground leading-relaxed">{t.issue_1}</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-primary font-mono shrink-0 mt-0.5" aria-hidden="true">2.</span>
                    <span className="text-muted-foreground leading-relaxed">{t.issue_2}</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-primary font-mono shrink-0 mt-0.5" aria-hidden="true">3.</span>
                    <span className="text-muted-foreground leading-relaxed">{t.issue_3}</span>
                  </li>
                </ul>
              </div>
            </div>
          </GlassCard>

          {/* Contact */}
          <GlassCard className="p-6 md:p-8" glow="brand">
            <div className="flex items-start gap-3">
              <Mail className="size-5 text-primary mt-1 shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-xl font-semibold">{t.contact_section}</h2>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {t.contact_text}{" "}
                  <a
                    href={`mailto:${t.contact_email}`}
                    className="text-primary hover:underline font-medium"
                  >
                    {t.contact_email}
                  </a>
                  . {t.contact_followup}
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </main>
    </div>
  );
}
