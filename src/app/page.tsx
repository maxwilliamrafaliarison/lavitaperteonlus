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
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden">
      {/* Image de fond plein écran */}
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

      {/* Voile dense pour garantir contraste 4.5:1 partout (RGAA 3.2) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-black/55"
      />
      {/* Gradient horizontal complémentaire (zones texte/CTA) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-r from-black/40 via-transparent to-black/40"
      />
      {/* Vignette douce */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.5)_100%)]"
      />

      {/* Header */}
      <header className="relative z-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 md:px-10">
          <div className="text-white [&_*]:!text-white [&_span:last-child]:!text-white/70">
            <BrandLogo />
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher value={lang} onChange={setLang} persist />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Centre — split asymétrique CTA gauche / texte droite */}
      <main id="main-content" className="relative z-10 flex flex-1 items-center px-6 py-8 md:px-10">
        <div className="mx-auto grid w-full max-w-7xl gap-12 md:grid-cols-2 md:items-center md:gap-8">
          {/* CTA à gauche */}
          <div className="flex justify-center md:justify-start md:order-1 order-2">
            <Link href="/login">
              <GlassButton variant="brand" size="lg" shimmer className="h-14 px-8 text-base">
                {t.landing.cta_login}
                <ArrowRight className="size-5" />
              </GlassButton>
            </Link>
          </div>

          {/* Texte à droite (mobile : centré pour équilibre) */}
          <div className="text-center md:text-right md:order-2 order-1">
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white drop-shadow-lg md:text-6xl lg:text-7xl">
              {t.landing.hero_title}
            </h1>
            <p className="mt-6 text-base text-white/85 drop-shadow md:text-lg lg:text-xl">
              {t.landing.hero_desc}
            </p>
          </div>
        </div>
      </main>

      {/* Footer minimal */}
      <footer className="relative z-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-2 px-6 py-5 md:flex-row md:justify-between md:px-10">
          <p className="text-[11px] text-white/70">
            © {new Date().getFullYear()} La Vita Per Te · ONG-ODV Alfeo Corassori
          </p>
          <Link
            href="/accessibilite"
            className="text-[11px] text-white/70 hover:text-white underline-offset-2 hover:underline transition-colors"
          >
            {t.a11y.page_title}
          </Link>
        </div>
      </footer>
    </div>
  );
}
