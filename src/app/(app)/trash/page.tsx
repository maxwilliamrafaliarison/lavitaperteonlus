import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppTopbar } from "@/components/layout/app-topbar";
import { PhaseStub } from "../_stub";

export default async function TrashPage() {
  const session = await auth();
  if (session?.user.role !== "admin") redirect("/dashboard");

  return (
    <>
      <AppTopbar title="Corbeille" />
      <PhaseStub
        title="Corbeille"
        phase="Phase 7"
        description="Matériels supprimés (soft delete) — restauration ou suppression définitive. Réservé à l'administrateur."
      />
    </>
  );
}
