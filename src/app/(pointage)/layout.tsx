import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { can } from "@/lib/auth/permissions";

// Données de présence du personnel → toujours dynamique.
export const dynamic = "force-dynamic";

/**
 * Chrome de l'app Pointage : shell commun (sidebar à gauche, accent violet).
 */
export default async function PointageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:pointage")) redirect("/apps");
  const { name, email, role, lang } = session.user;

  return (
    <AppShell
      appKey="pointage"
      user={{ name: name ?? "", email: email ?? "", role, lang }}
    >
      {children}
    </AppShell>
  );
}
