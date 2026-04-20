import { AppTopbar } from "@/components/layout/app-topbar";
import { PhaseStub } from "../_stub";

export default function SettingsPage() {
  return (
    <>
      <AppTopbar title="Réglages" />
      <PhaseStub
        title="Réglages"
        phase="Phase 8"
        description="Préférences personnelles : langue (FR/IT), thème (sombre/clair), notifications."
      />
    </>
  );
}
