"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid } from "lucide-react";

import { cn } from "@/lib/utils";
import { BrandLogo } from "./brand-logo";
import { navIcon } from "./nav-icons";
import { getT, type Lang } from "@/lib/i18n";
import type { NavItemSpec } from "@/lib/nav/config";

/**
 * Sidebar commune à toutes les applications (desktop ≥ lg).
 *
 * Pilotée par données : elle ne connaît aucune app en particulier. Le layout
 * lui passe l'identité de l'app (nom + icône) et la liste d'items DÉJÀ filtrée
 * par rôle côté serveur. L'accent (état actif) vient des utilities `accent`,
 * re-scopées par app via data-app dans globals.css — d'où le repère couleur.
 */
export function AppSidebar({
  nameKey,
  appIcon,
  items,
  lang = "fr",
  compteurs,
}: {
  nameKey: string;
  appIcon: string;
  items: NavItemSpec[];
  lang?: Lang;
  /** Comptes des pastilles (calculés côté serveur par le shell). */
  compteurs?: Record<string, number>;
}) {
  const pathname = usePathname();
  const t = React.useMemo(() => getT(lang), [lang]);
  const AppIcon = navIcon(appIcon);

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col gap-5 px-5 py-6 border-r border-glass-border bg-sidebar/40 backdrop-blur-2xl">
      <div className="px-2">
        <Link href="/apps" aria-label="La Vita Per Te">
          <BrandLogo size={36} />
        </Link>
      </div>

      {/* Identité de l'app courante (repère couleur = accent) */}
      <div className="flex items-center gap-2.5 rounded-xl border border-accent/25 bg-accent/8 px-3 py-2.5">
        <AppIcon className="size-4 text-accent" aria-hidden="true" />
        <span className="font-display text-sm font-semibold text-accent">
          {t(nameKey)}
        </span>
      </div>

      {/* Retour au portail multi-applications */}
      <Link
        href="/apps"
        className="flex items-center gap-3 rounded-xl px-3 h-10 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all border border-glass-border glass"
      >
        <LayoutGrid className="size-4" aria-hidden="true" />
        {t("hub.back_to_hub")}
      </Link>

      <nav className="flex-1 space-y-1" aria-label={t("nav.aria_label")}>
        {items.map((item, i) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = navIcon(item.icon);
          // Intitulé de section quand le groupe change — l'œil retrouve
          // « Stock » sans lire chaque entrée.
          const nouveauGroupe =
            item.groupeKey && item.groupeKey !== items[i - 1]?.groupeKey;
          return (
            <React.Fragment key={item.href}>
              {nouveauGroupe && (
                <p className="px-3 pb-1 pt-4 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
                  {t(item.groupeKey!)}
                </p>
              )}
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all",
                  item.emphase ? "h-11" : "h-10",
                  // L'acte du métier (la vente) est un bouton plein : il se
                  // voit depuis l'autre bout du comptoir.
                  item.emphase
                    ? "bg-accent text-accent-foreground shadow-md hover:brightness-110"
                    : active
                      ? "bg-accent/12 text-accent border border-accent/25 shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
              >
                <Icon
                  className={cn("size-4", !item.emphase && active && "text-accent")}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">{t(item.labelKey)}</span>
                <Pastilles badges={item.badges} compteurs={compteurs} lang={lang} />
              </Link>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="px-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
        v1.0 · {new Date().getFullYear()}
      </div>
    </aside>
  );
}

/**
 * Pastilles d'alerte d'une entrée : ruptures (rouge) et péremptions ≤ 90 j
 * (ambre). Un zéro ne s'affiche pas — une pastille doit signifier « quelque
 * chose à faire », sinon elle devient du bruit qu'on apprend à ignorer.
 */
export function Pastilles({
  badges,
  compteurs,
  lang = "fr",
}: {
  badges?: NavItemSpec["badges"];
  compteurs?: Record<string, number>;
  lang?: Lang;
}) {
  if (!badges?.length || !compteurs) return null;
  const t = getT(lang);
  const STYLES: Record<string, { classe: string; titreKey: string }> = {
    ruptures: {
      classe: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
      titreKey: "pharmacie.badge_ruptures",
    },
    peremptions: {
      classe: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
      titreKey: "pharmacie.badge_peremptions",
    },
  };
  return (
    <span className="flex items-center gap-1">
      {badges.map((b) => {
        const n = compteurs[b] ?? 0;
        if (n <= 0) return null;
        const sty = STYLES[b];
        return (
          <span
            key={b}
            title={t(sty.titreKey)}
            className={cn(
              "inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1 font-mono text-[10px] font-semibold leading-none",
              sty.classe,
            )}
          >
            {n}
            <span className="sr-only"> — {t(sty.titreKey)}</span>
          </span>
        );
      })}
    </span>
  );
}
