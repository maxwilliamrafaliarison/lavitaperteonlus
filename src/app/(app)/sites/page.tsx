import { AppTopbar } from "@/components/layout/app-topbar";
import { PhaseStub } from "../_stub";

export default function SitesPage() {
  return (
    <>
      <AppTopbar title="Sites & salles" />
      <PhaseStub
        title="Sites & salles"
        phase="Phase 3"
        description="Cartographie interactive des centres (REX, MIARAKA) et de leurs salles avec compteurs de matériels par salle."
      />
    </>
  );
}
