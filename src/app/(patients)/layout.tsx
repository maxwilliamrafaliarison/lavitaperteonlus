import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { can } from "@/lib/auth/permissions";
import { getT } from "@/lib/i18n";

// Données de santé → toujours dynamique, jamais mis en cache
export const dynamic = "force-dynamic";

/**
 * Chrome de l'app Patients : shell commun (sidebar à gauche, accent cyan) +
 * bannière de confidentialité RGPD sous la topbar — chaque consultation de
 * dossier est tracée dans le journal d'accès.
 */
export default async function PatientsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:patients")) redirect("/apps");
  const { name, email, role, lang } = session.user;
  const t = getT(lang);

  const banner = (
    <div className="border-b border-warning/25 bg-warning/[0.06]">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 md:px-8 py-2 text-[11px] text-warning">
        <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{t("patients.privacy_banner")}</span>
      </div>
    </div>
  );

  return (
    <AppShell
      appKey="patients"
      user={{ name: name ?? "", email: email ?? "", role, lang }}
      banner={banner}
    >
      {children}
    </AppShell>
  );
}
