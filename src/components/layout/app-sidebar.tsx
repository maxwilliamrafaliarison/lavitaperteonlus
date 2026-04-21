"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Cpu,
  ArrowLeftRight,
  Users,
  Trash2,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { BrandLogo } from "./brand-logo";
import type { UserRole } from "@/types";
import { can } from "@/lib/auth/permissions";
import { getT, type Lang } from "@/lib/i18n";

interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  /** Si défini, l'item n'apparait que pour les rôles autorisés. */
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

export function AppSidebar({ role, lang = "fr" }: { role: UserRole; lang?: Lang }) {
  const pathname = usePathname();
  const t = React.useMemo(() => getT(lang), [lang]);

  const items = NAV.filter(
    (item) => !item.visibleFor || item.visibleFor.includes(role),
  );

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col gap-6 px-5 py-6 border-r border-glass-border bg-sidebar/40 backdrop-blur-2xl">
      <div className="px-2">
        <Link href="/dashboard">
          <BrandLogo size={36} />
        </Link>
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
                "flex items-center gap-3 rounded-xl px-3 h-10 text-sm font-medium transition-all",
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
  );
}

// Helper exporté si besoin de filtrer ailleurs
export function filterNavForRole(role: UserRole): NavItem[] {
  return NAV.filter(
    (item) => !item.visibleFor || item.visibleFor.includes(role),
  );
}

// Permissions helper réexporté pour pratique
export { can };
