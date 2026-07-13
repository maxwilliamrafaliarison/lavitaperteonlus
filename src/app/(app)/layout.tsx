import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppSidebar } from "@/components/layout/app-sidebar";
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

  return (
    <div className="relative min-h-screen">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -left-24 h-[480px] w-[480px] rounded-full bg-primary/15 blur-[140px]" />
        <div className="absolute top-1/3 -right-32 h-[480px] w-[480px] rounded-full bg-accent/12 blur-[140px]" />
      </div>

      <div className="flex min-h-screen">
        <AppSidebar role={session.user.role} lang={session.user.lang} />
        <div className="flex-1 flex flex-col min-w-0">{children}</div>
      </div>
    </div>
  );
}
