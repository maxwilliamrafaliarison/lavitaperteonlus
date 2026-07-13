import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutGrid, HeartPulse, ShieldAlert } from "lucide-react";

import { auth } from "@/auth";
import { BrandLogo } from "@/components/layout/brand-logo";
import { UserMenu } from "@/components/layout/user-menu";
import { can } from "@/lib/auth/permissions";
import { getT } from "@/lib/i18n";

// Données de santé → toujours dynamique, jamais mis en cache
export const dynamic = "force-dynamic";

/**
 * Chrome de l'app Patients. Accès réservé (app:patients = admin +
 * direction). Bannière de rappel de confidentialité : chaque
 * consultation de dossier est tracée dans le journal d'accès.
 */
export default async function PatientsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:patients")) redirect("/apps");
  const { name, role, lang } = session.user;
  const t = getT(lang);

  return (
    <div className="relative isolate min-h-screen">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -left-24 h-[480px] w-[480px] rounded-full bg-accent/12 blur-[140px]" />
        <div className="absolute top-1/3 -right-32 h-[480px] w-[480px] rounded-full bg-primary/8 blur-[140px]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-glass-border bg-background/60 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/apps" className="shrink-0">
              <BrandLogo size={32} showText={false} />
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full glass border px-2.5 h-7 text-xs font-medium text-accent">
              <HeartPulse className="size-3.5" aria-hidden="true" />
              {t("hub.app_patients")}
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

      {/* Bannière confidentialité — données de santé */}
      <div className="border-b border-[oklch(0.82_0.16_85_/_0.25)] bg-[oklch(0.82_0.16_85_/_0.06)]">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 md:px-8 py-2 text-[11px] text-[oklch(0.82_0.16_85)]">
          <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{t("patients.privacy_banner")}</span>
        </div>
      </div>

      {children}
    </div>
  );
}
