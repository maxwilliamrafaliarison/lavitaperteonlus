"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Cpu,
  ShieldCheck,
  Sparkles,
  Building2,
  Activity,
} from "lucide-react";

import { GlassCard } from "@/components/glass/glass-card";
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

  // Initialise depuis cookie/localStorage ou langue du navigateur (un seul effet au mount)
  React.useEffect(() => {
    const stored = getStoredLang();
    if (stored) setLang(stored);
    else setLang(detectBrowserLang());
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Decorative ambient orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-24 h-[480px] w-[480px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute top-1/3 -right-32 h-[520px] w-[520px] rounded-full bg-accent/15 blur-[140px]" />
        <div className="absolute bottom-0 left-1/3 h-[380px] w-[380px] rounded-full bg-primary/10 blur-[120px]" />
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

      {/* Hero */}
      <main className="relative z-10 mx-auto max-w-7xl px-6 md:px-10">
        <section className="pt-12 pb-24 md:pt-24 md:pb-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="max-w-3xl"
          >
            <span className="inline-flex items-center gap-2 rounded-full glass border px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              {t.landing.hero_eyebrow}
            </span>

            <h1 className="mt-8 font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
              {t.landing.hero_title.split(",")[0]},
              <br />
              <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                {t.landing.hero_title.split(",")[1]?.trim() ?? ""}
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
              {t.landing.hero_desc}
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link href="/login">
                <GlassButton variant="brand" size="lg" shimmer className="relative">
                  {t.landing.cta_login}
                  <ArrowRight className="size-4" />
                </GlassButton>
              </Link>
              <GlassButton variant="glass" size="lg">
                {t.landing.cta_learn}
              </GlassButton>
            </div>
          </motion.div>

          {/* Hero visual — carte liquide de démonstration */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease: "easeOut" }}
            className="relative mt-20"
          >
            <GlassCard
              intensity="strong"
              glow="brand"
              className="relative overflow-hidden p-0"
            >
              <div className="grid gap-0 md:grid-cols-2">
                {/* Image à gauche */}
                <div className="relative aspect-[4/3] md:aspect-auto">
                  <Image
                    src="/logo/centre-rex.jpg"
                    alt="Centre REX Fianarantsoa"
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-tr from-background/90 via-background/20 to-transparent" />
                  <div className="absolute bottom-6 left-6 right-6">
                    <span className="inline-flex items-center gap-2 rounded-full glass-strong border px-3 py-1 text-xs font-medium">
                      <Building2 className="size-3.5 text-accent" />
                      Centre REX · Fianarantsoa
                    </span>
                  </div>
                </div>

                {/* Mini dashboard preview */}
                <div className="relative p-8 md:p-10">
                  <div className="grid grid-cols-2 gap-4">
                    <MiniStat label="Matériels suivis" value="222" accent="primary" />
                    <MiniStat label="Salles" value="14" accent="cyan" />
                    <MiniStat label="Utilisateurs" value="48" accent="success" />
                    <MiniStat label="À remplacer" value="11" accent="warning" />
                  </div>
                  <div className="mt-8 flex items-center gap-3 rounded-2xl glass border p-4">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Activity className="size-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Score parc global</p>
                      <p className="text-xs text-muted-foreground">Mis à jour à l&apos;instant</p>
                    </div>
                    <div className="font-display text-2xl font-semibold text-primary">
                      74<span className="text-base text-muted-foreground">/100</span>
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </section>

        {/* Features */}
        <section className="pb-32">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="font-display text-3xl font-semibold tracking-tight md:text-4xl"
          >
            {t.landing.features_title}
          </motion.h2>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <FeatureCard
              icon={<Cpu className="size-6" />}
              title={t.landing.feature_1_title}
              desc={t.landing.feature_1_desc}
              delay={0}
            />
            <FeatureCard
              icon={<Activity className="size-6" />}
              title={t.landing.feature_2_title}
              desc={t.landing.feature_2_desc}
              accent="cyan"
              delay={0.1}
            />
            <FeatureCard
              icon={<ShieldCheck className="size-6" />}
              title={t.landing.feature_3_title}
              desc={t.landing.feature_3_desc}
              delay={0.2}
            />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-glass-border">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-6 py-10 md:flex-row md:items-center md:px-10">
          <BrandLogo size={32} />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} La Vita Per Te · ONG-ODV Alfeo Corassori · Fianarantsoa, Madagascar
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ----------------------------------------------------------- */

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "primary" | "cyan" | "success" | "warning";
}) {
  const accentCls =
    accent === "primary"
      ? "text-primary"
      : accent === "cyan"
        ? "text-accent"
        : accent === "success"
          ? "text-[oklch(0.75_0.18_150)]"
          : "text-[oklch(0.82_0.16_85)]";
  return (
    <div className="rounded-2xl glass border p-4">
      <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1.5 font-display text-3xl font-semibold ${accentCls}`}>
        {value}
      </p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
  accent = "primary",
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  accent?: "primary" | "cyan";
  delay?: number;
}) {
  const iconBg =
    accent === "cyan"
      ? "bg-accent/15 text-accent"
      : "bg-primary/15 text-primary";

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay }}
    >
      <GlassCard interactive className="h-full p-8">
        <div
          className={`inline-flex size-12 items-center justify-center rounded-2xl ${iconBg}`}
        >
          {icon}
        </div>
        <h3 className="mt-6 font-display text-xl font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
      </GlassCard>
    </motion.div>
  );
}
