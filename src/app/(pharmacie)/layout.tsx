import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { can } from "@/lib/auth/permissions";

// Session + rôle requis → toujours dynamique
export const dynamic = "force-dynamic";

/**
 * Chrome de l'app Pharmacie : shell commun (sidebar à gauche, accent vert).
 */
export default async function PharmacieLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:pharmacie")) redirect("/apps");
  const { name, email, role, lang } = session.user;

  return (
    <AppShell
      appKey="pharmacie"
      user={{ name: name ?? "", email: email ?? "", role, lang }}
    >
      {children}
    </AppShell>
  );
}
