/* Types partagés du planning. Le rendu vit dans gantt.tsx : la grille de
   menus déroulants qui occupait ce fichier se lisait mal — il fallait ouvrir
   chaque cellule pour savoir qui travaillait quand. */

export interface CreneauOption {
  id: string;
  libelle: string;
  type: string;
  /** Étiquette complète, affichée dans le sélecteur. */
  court: string;
  debut: string;
  fin: string;
}

export interface AgentLigne {
  id: string;
  nom: string;
  statut: string;
}
