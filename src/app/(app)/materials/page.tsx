import { AppTopbar } from "@/components/layout/app-topbar";
import { PhaseStub } from "../_stub";

export default function MaterialsPage() {
  return (
    <>
      <AppTopbar title="Parc matériel" />
      <PhaseStub
        title="Parc matériel"
        phase="Phase 3"
        description="Liste complète, recherche, filtres par type/site/salle/état, et fiche détaillée pour chaque matériel."
      />
    </>
  );
}
