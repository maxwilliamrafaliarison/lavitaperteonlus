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
}: {
  nameKey: string;
  appIcon: string;
  items: NavItemSpec[];
  lang?: Lang;
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
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = navIcon(item.icon);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 h-10 text-sm font-medium transition-all",
                active
                  ? "bg-accent/12 text-accent border border-accent/25 shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5",
              )}
            >
              <Icon className={cn("size-4", active && "text-accent")} aria-hidden="true" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
        v1.0 · {new Date().getFullYear()}
      </div>
    </aside>
  );
}
