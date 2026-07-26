import { redirect } from "next/navigation";

/**
 * La présence du jour EST le tableau de bord : plutôt que de dupliquer
 * l'écran, l'entrée de menu y renvoie.
 */
export default function PresenceRedirect() {
  redirect("/pointage");
}
