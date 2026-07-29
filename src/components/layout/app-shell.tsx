import * as React from "react";

import { can } from "@/lib/auth/permissions";
import { getT, type Lang } from "@/lib/i18n";
import type { UserRole } from "@/types";
import { APP_NAV, type AppKey } from "@/lib/nav/config";
import { safe } from "@/lib/sheets/safe";

import { AppSidebar } from "./app-sidebar";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";
import { navIcon } from "./nav-icons";

/**
 * Chrome COMMUN à toutes les applications : sidebar à gauche (desktop),
 * topbar (hamburger mobile + identité + menu utilisateur), fond teinté par
 * l'accent de l'app, et un emplacement optionnel de bannière sous la topbar.
 *
 * Toute la personnalisation tient dans `appKey` : nom, icône et navigation
 * viennent de APP_NAV, l'accent de couleur de data-app (globals.css). Les
 * items de nav sont filtrés par rôle ICI (serveur, via can()) avant d'être
 * passés aux composants client — aucune fonction ne traverse la frontière.
 *
 * Nouvelle app = un layout de quelques lignes qui rend <AppShell appKey=…>.
 */
export async function AppShell({
  appKey,
  user,
  banner,
  children,
}: {
  appKey: AppKey;
  user: { name: string; email: string; role: UserRole; lang: Lang };
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const nav = APP_NAV[appKey];
  const t = getT(user.lang);
  const items = nav.items.filter(
    (item) => !item.permission || can(user.role, item.permission),
  );
  const AppIcon = navIcon(nav.icon);

  // Pastilles de la pharmacie : calculées ICI, côté serveur, à chaque
  // affichage — le menu prévient avant le clic. En cas de panne réseau, on
  // n'affiche simplement rien : une pastille fausse serait pire qu'absente.
  let compteurs: Record<string, number> | undefined;
  if (appKey === "pharmacie") {
    const res = await safe(async () => {
      const { listProduitsAvecStock } = await import("@/lib/pharmacie/sheets");
      const produits = await listProduitsAvecStock();
      const actifs = produits.filter((p) => p.statut === "actif");
      return {
        ruptures: actifs.filter((p) => p.stockBase <= 0).length,
        peremptions: actifs.filter(
          (p) => (p.joursAvantPeremption ?? 999) >= 0 && (p.joursAvantPeremption ?? 999) <= 90,
        ).length,
      };
    }, undefined);
    compteurs = res.ok ? res.data : undefined;
  }

  return (
    <div data-app={appKey} className="relative isolate min-h-screen">
      {/* Fond ambient — teinté par l'accent de l'app (repère couleur) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -left-24 h-[480px] w-[480px] rounded-full bg-accent/12 blur-[140px]" />
        <div className="absolute top-1/3 -right-32 h-[480px] w-[480px] rounded-full bg-primary/8 blur-[140px]" />
      </div>

      <div className="flex min-h-screen">
        <AppSidebar
          nameKey={nav.nameKey}
          appIcon={nav.icon}
          items={items}
          lang={user.lang}
          compteurs={compteurs}
        />

        <div className="flex flex-1 flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-glass-border bg-background/60 backdrop-blur-2xl px-4 md:px-8">
            <div className="flex items-center gap-3 min-w-0">
              <MobileNav nameKey={nav.nameKey} items={items} lang={user.lang} compteurs={compteurs} />
              {/* Identité de l'app — mobile seulement (desktop l'a en sidebar) */}
              <span className="lg:hidden inline-flex items-center gap-1.5 rounded-full glass border px-2.5 h-7 text-xs font-medium text-accent">
                <AppIcon className="size-3.5" aria-hidden="true" />
                {t(nav.nameKey)}
              </span>
            </div>

            <UserMenu
              name={user.name || user.email}
              email={user.email}
              role={user.role}
              lang={user.lang}
            />
          </header>

          {banner}

          {children}
        </div>
      </div>
    </div>
  );
}
