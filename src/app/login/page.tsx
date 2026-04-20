"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Lock, Mail } from "lucide-react";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LanguageSwitcher, type Lang } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import fr from "@/lib/i18n/messages/fr.json";
import it from "@/lib/i18n/messages/it.json";

const messages = { fr, it } as const;

export default function LoginPage() {
  const [lang, setLang] = React.useState<Lang>("fr");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const t = messages[lang];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // L'auth réelle sera implémentée en Phase 2 (Auth.js v5 + Google Sheets users)
    alert("Auth à implémenter en Phase 2 — " + email);
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-primary/15 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-accent/15 blur-[120px]" />
      </div>

      {/* Top bar */}
      <header className="relative z-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 md:px-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            Retour
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher value={lang} onChange={setLang} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Login card */}
      <main className="relative z-10 flex min-h-[calc(100vh-96px)] items-center justify-center px-6 pb-20">
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

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t.login.email}
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="direction.lavitaperte@gmail.com"
                    className="w-full h-12 rounded-2xl glass border pl-11 pr-4 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t.login.password}
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-12 rounded-2xl glass border pl-11 pr-4 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 transition-all"
                  />
                </div>
              </div>

              <GlassButton
                variant="brand"
                size="lg"
                shimmer
                type="submit"
                className="w-full"
              >
                {t.login.submit}
              </GlassButton>

              <div className="text-center">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t.login.forgot}
                </button>
              </div>
            </form>
          </GlassCard>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Accès réservé aux personnels du Centre REX & MIARAKA
          </p>
        </motion.div>
      </main>
    </div>
  );
}
