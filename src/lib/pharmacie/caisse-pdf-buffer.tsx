import { renderToBuffer } from "@react-pdf/renderer";

import { EtatCaissePdf } from "./reports/caisse-pdf";
import type { EtatCaisse } from "./caisse-etat";
import type { EntiteLegale } from "./entite";

/* ============================================================
   L'ÉTAT DE CAISSE EN PDF, EN MÉMOIRE
   ============================================================

   Le même document que celui servi par /api/pharmacie/caisse/<séance>,
   rendu en mémoire pour être JOINT au courriel plutôt que lié.

   Un lien vers l'application suppose une session : depuis une boîte mail,
   il conduit à l'écran de connexion, ce qui est exactement l'inverse de ce
   qu'attend une personne qui veut classer une pièce. Et une pièce à
   conserver dix ans ne doit dépendre ni d'un compte, ni d'une adresse
   d'hébergement.

   Ce fichier est en .tsx parce que le rendu passe par du JSX ; il vit à
   part de `caisse-mail.ts` pour que la composition du courriel reste une
   fonction pure, affichable sans charger le moteur PDF.
   ============================================================ */

export async function pdfEtatCaisse(
  etat: EtatCaisse,
  entite: EntiteLegale,
  numero: string,
): Promise<Buffer> {
  return renderToBuffer(<EtatCaissePdf etat={etat} entite={entite} numero={numero} />);
}
