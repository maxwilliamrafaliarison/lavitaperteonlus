"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu, X,
  LayoutDashboard, Building2, Cpu, ArrowLeftRight,
  Users, Trash2, ScrollText, Settings,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { BrandLogo } from "./brand-logo";
import { getT, type Lang } from "@/lib/i18n";
import type { UserRole } from "@/types";

interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  visibleFor?: UserRole[];
}

const NAV: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/sites", labelKey: "nav.sites", icon: Building2 },
  { href: "/materials", labelKey: "nav.materials", icon: Cpu },
  { href: "/movements", labelKey: "nav.movements", icon: ArrowLeftRight },
  { href: "/users", labelKey: "nav.users", icon: Users, visibleFor: ["admin"] },
  { href: "/trash", labelKey: "nav.trash", icon: Trash2, visibleFor: ["admin"] },
  { href: "/audit", labelKey: "nav.audit", icon: ScrollText, visibleFor: ["admin"] },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
];

export function MobileNav({ role, lang = "fr" }: { role: UserRole; lang?: Lang }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const t = React.useMemo(() => getT(lang), [lang]);

  const items = NAV.filter(
    (item) => !item.visibleFor || item.visibleFor.includes(role),
  );

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
        aria-label="Menu"
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
          <Link href="/dashboard" onClick={() => setOpen(false)}>
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

        <nav className="flex-1 space-y-1">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-medium transition-all",
                  active
                    ? "bg-primary/12 text-primary border border-primary/20 shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
              >
                <Icon className={cn("size-4", active && "text-primary")} />
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
