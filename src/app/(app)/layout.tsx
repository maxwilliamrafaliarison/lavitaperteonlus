import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { can } from "@/lib/auth/permissions";

// Protégé : nécessite cookies de session → toujours dynamique
export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // L'app Logistique est réservée aux rôles autorisés ; les autres
  // (ex. pharmacien) sont renvoyés vers le portail.
  if (!can(session.user.role, "app:logistique")) redirect("/apps");
  const { name, email, role, lang } = session.user;

  return (
    <AppShell
      appKey="logistique"
      user={{ name: name ?? "", email: email ?? "", role, lang }}
    >
      {children}
    </AppShell>
  );
}
