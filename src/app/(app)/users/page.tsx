import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Users as UsersIcon } from "lucide-react";

import { AppTopbar } from "@/components/layout/app-topbar";
import { SheetEmptyState } from "@/components/layout/sheet-empty-state";
import { UsersManager } from "@/components/users/users-manager";
import { listUsers } from "@/lib/sheets/users";
import { safe, isConfigError } from "@/lib/sheets/safe";
import type { AppUser } from "@/types";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");

  const usersRes = await safe<AppUser[]>(() => listUsers(), []);
  const users = usersRes.data;
  const configIssue = isConfigError(usersRes.error);

  // Tri : admins en premier, puis par nom
  const sorted = [...users].sort((a, b) => {
    if (a.role === "admin" && b.role !== "admin") return -1;
    if (b.role === "admin" && a.role !== "admin") return 1;
    return a.name.localeCompare(b.name, "fr");
  });

  return (
    <>
      <AppTopbar title="Utilisateurs" />

      <main className="flex-1 p-6 md:p-10 space-y-8">
        <header className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Administration
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="inline-flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <UsersIcon className="size-5" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
              Utilisateurs
            </h2>
          </div>
          <p className="mt-3 text-muted-foreground">
            Invitez les membres de l&apos;équipe, attribuez-leur un rôle
            (administrateur, informaticien, direction, logistique) et gérez
            leurs accès. Toutes les actions sont enregistrées dans le journal
            d&apos;audit.
          </p>
        </header>

        {configIssue ? (
          <SheetEmptyState configError />
        ) : (
          <UsersManager users={sorted} currentUserId={session.user.id} />
        )}
      </main>
    </>
  );
}
