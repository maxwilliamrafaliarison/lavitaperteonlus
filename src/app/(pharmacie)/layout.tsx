import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutGrid, Pill } from "lucide-react";

import { auth } from "@/auth";
import { BrandLogo } from "@/components/layout/brand-logo";
import { UserMenu } from "@/components/layout/user-menu";
import { can } from "@/lib/auth/permissions";
import { getT } from "@/lib/i18n";

// Session + rôle requis → toujours dynamique
export const dynamic = "force-dynamic";

/**
 * Chrome de l'app Pharmacie : topbar légère (logo, badge app, retour
 * portail, menu utilisateur). Pas de sidebar — l'app est simple et
 * pensée mobile-first pour le comptoir.
 */
export default async function PharmacieLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:pharmacie")) redirect("/apps");
  const { name, role, lang } = session.user;
  const t = getT(lang);

  return (
    <div className="relative isolate min-h-screen">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -left-24 h-[480px] w-[480px] rounded-full bg-[oklch(0.75_0.18_150_/_0.12)] blur-[140px]" />
        <div className="absolute top-1/3 -right-32 h-[480px] w-[480px] rounded-full bg-accent/10 blur-[140px]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-glass-border bg-background/60 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/apps" className="shrink-0">
              <BrandLogo size={32} showText={false} />
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full glass border px-2.5 h-7 text-xs font-medium text-[oklch(0.75_0.18_150)]">
              <Pill className="size-3.5" aria-hidden="true" />
              {t("hub.app_pharmacie")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/apps"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full glass border px-3 h-9 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <LayoutGrid className="size-3.5" aria-hidden="true" />
              {t("hub.back_to_hub")}
            </Link>
            <UserMenu
              name={name ?? ""}
              email={session.user.email ?? ""}
              role={role}
              lang={lang}
            />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
