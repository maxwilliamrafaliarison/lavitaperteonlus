import { redirect } from "next/navigation";
import { auth } from "@/auth";

// Protégé : session requise → toujours dynamique
export const dynamic = "force-dynamic";

/**
 * Layout du springboard (portail multi-applications).
 * Pas de sidebar Logistique : le hub est neutre, chaque application
 * embarque ensuite son propre chrome.
 */
export default async function HubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return <div className="relative isolate min-h-screen">{children}</div>;
}
