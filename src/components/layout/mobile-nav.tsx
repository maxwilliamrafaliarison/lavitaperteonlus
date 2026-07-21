"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutGrid } from "lucide-react";

import { cn } from "@/lib/utils";
import { BrandLogo } from "./brand-logo";
import { navIcon } from "./nav-icons";
import { getT, type Lang } from "@/lib/i18n";
import type { NavItemSpec } from "@/lib/nav/config";

/**
 * Drawer de navigation mobile (< lg), commun à toutes les applications.
 * Même source de données que la sidebar (items déjà filtrés par rôle), même
 * accent par app. Bouton hamburger rendu dans la topbar du shell.
 */
export function MobileNav({
  nameKey,
  items,
  lang = "fr",
}: {
  nameKey: string;
  items: NavItemSpec[];
  lang?: Lang;
}) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const t = React.useMemo(() => getT(lang), [lang]);

  // Ferme le drawer quand la route change
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Empêche le scroll du body quand le drawer est ouvert
  React.useEffect(() => {
    if (open) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t(nameKey)}
        aria-expanded={open}
        className="inline-flex lg:hidden size-10 items-center justify-center rounded-xl glass border hover:bg-white/8 transition-colors"
      >
        <Menu className="size-5" />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Drawer */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-screen w-72 max-w-[85vw] flex-col gap-6 px-5 py-6",
          "bg-sidebar/95 backdrop-blur-2xl border-r border-glass-border",
          "transition-transform duration-300 ease-out will-change-transform",
          "lg:hidden",
          open ? "translate-x-0 flex" : "-translate-x-full flex",
        )}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between">
          <Link href="/apps" onClick={() => setOpen(false)}>
            <BrandLogo size={36} />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer"
            className="inline-flex size-9 items-center justify-center rounded-xl hover:bg-white/8 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Retour au portail multi-applications */}
        <Link
          href="/apps"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all border border-glass-border glass"
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
                  "flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-medium transition-all",
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
    </>
  );
}
