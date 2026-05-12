"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { GlassButton } from "@/components/glass/glass-button";
import { BrandLogo } from "@/components/layout/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageSwitcher, type Lang } from "@/components/layout/language-switcher";
import { getStoredLang, detectBrowserLang } from "@/lib/i18n/persist";
import fr from "@/lib/i18n/messages/fr.json";
import it from "@/lib/i18n/messages/it.json";

const messages = { fr, it } as const;

export default function LandingPage() {
  const [lang, setLang] = React.useState<Lang>("fr");
  const t = messages[lang];

  // Détecte la langue stockée ou celle du navigateur
  React.useEffect(() => {
    const stored = getStoredLang();
    if (stored) setLang(stored);
    else setLang(detectBrowserLang());
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Halo discret */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[420px] w-[420px] rounded-full bg-primary/12 blur-[140px]" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[320px] w-[320px] rounded-full bg-accent/10 blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 md:px-10">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <LanguageSwitcher value={lang} onChange={setLang} persist />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Centre — tient sur un écran */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-8">
        <div className="flex flex-col items-center text-center">
          {/* Visuel principal */}
          <div className="relative size-44 overflow-hidden rounded-3xl border border-glass-border shadow-2xl md:size-56">
            <Image
              src="/logo/centre-rex.jpg"
              alt="Centre REX Fianarantsoa"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 176px, 224px"
              priority
            />
          </div>

          {/* Titre simple */}
          <h1 className="mt-10 max-w-md font-display text-2xl font-semibold tracking-tight md:text-3xl">
            {t.landing.hero_title}
          </h1>

          {/* Description en une ligne */}
          <p className="mt-2 text-sm text-muted-foreground md:text-base">
            {t.landing.hero_desc}
          </p>

          {/* CTA unique */}
          <Link href="/login" className="mt-8">
            <GlassButton variant="brand" size="lg" shimmer>
              {t.landing.cta_login}
              <ArrowRight className="size-4" />
            </GlassButton>
          </Link>
        </div>
      </main>

      {/* Footer minimal */}
      <footer className="relative z-10">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-6 py-5 md:px-10">
          <p className="text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} La Vita Per Te · ONG-ODV Alfeo Corassori
          </p>
        </div>
      </footer>
    </div>
  );
}
