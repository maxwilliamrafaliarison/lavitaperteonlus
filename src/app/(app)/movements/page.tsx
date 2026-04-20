import { AppTopbar } from "@/components/layout/app-topbar";
import { PhaseStub } from "../_stub";

export default function MovementsPage() {
  return (
    <>
      <AppTopbar title="Mouvements" />
      <PhaseStub
        title="Historique des mouvements"
        phase="Phase 6"
        description="Timeline des transferts entre salles et utilisateurs, avec raison et auteur."
      />
    </>
  );
}
