import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppTopbar } from "@/components/layout/app-topbar";
import { PhaseStub } from "../_stub";

export default async function AuditPage() {
  const session = await auth();
  if (session?.user.role !== "admin") redirect("/dashboard");

  return (
    <>
      <AppTopbar title="Journal d'audit" />
      <PhaseStub
        title="Journal d'audit"
        phase="Phase 4"
        description="Toutes les consultations de mots de passe, modifications, connexions/déconnexions — pour la traçabilité de sécurité. Réservé à l'administrateur."
      />
    </>
  );
}
