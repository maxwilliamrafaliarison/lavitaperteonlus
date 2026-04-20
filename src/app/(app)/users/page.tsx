import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppTopbar } from "@/components/layout/app-topbar";
import { PhaseStub } from "../_stub";

export default async function UsersPage() {
  const session = await auth();
  if (session?.user.role !== "admin") redirect("/dashboard");

  return (
    <>
      <AppTopbar title="Utilisateurs" />
      <PhaseStub
        title="Gestion des utilisateurs"
        phase="Phase 7"
        description="Inviter, désactiver, modifier les rôles des comptes (admin, informaticien, direction, logistique). Réservé à l'administrateur."
      />
    </>
  );
}
