import type { UserRole } from "@/types";

/* ============================================================
   MATRICE DES PERMISSIONS
   ============================================================ */
export const PERMISSIONS = {
  // Lecture
  "parc:read": ["admin", "informaticien", "direction", "logistique"],
  "password:reveal": ["admin", "informaticien", "direction"],
  "audit:read": ["admin"],
  "trash:read": ["admin"],

  // Écriture matériel
  "material:create": ["admin", "informaticien", "logistique"],
  "material:update": ["admin", "informaticien", "logistique"],
  "material:delete": ["admin", "informaticien", "logistique"],
  "material:restore": ["admin"],
  "material:hard_delete": ["admin"],

  // Transferts
  "movement:create": ["admin", "informaticien", "logistique"],

  // Admin
  "user:invite": ["admin"],
  "user:update": ["admin"],
  "user:deactivate": ["admin"],

  // Settings
  "settings:update": ["admin"],

  // Applications du portail (springboard)
  "app:logistique": ["admin", "informaticien", "direction", "logistique"],
  "app:pharmacie": ["admin", "direction", "pharmacien"],
  "app:patients": ["admin", "direction"],
  // Pointage : la direction consulte la présence en temps réel, l'admin gère.
  // La RH y entre aussi : la présence du personnel est son métier — et c'est
  // la SEULE app que son rôle ouvre.
  "app:pointage": ["admin", "direction", "rh"],

  // Pharmacie — écriture (la direction reste en lecture seule)
  "pharmacie:vendre": ["admin", "pharmacien"],
  "pharmacie:stock": ["admin", "pharmacien"],
  // Pharmacie — configuration (TVA…) : administrateur uniquement. Le
  // pharmacien vend et gère le stock mais ne touche pas au paramétrage
  // comptable, réservé à la direction/administration.
  "pharmacie:config": ["admin"],

  // Pointage — la DIRECTION et la RH lisent (présence, états mensuels).
  "pointage:lire": ["admin", "direction", "rh"],
  /* CORRIGER n'est pas ACCORDER, et la distinction est celle de la paie.
     Corriger RESTITUE un fait que la machine a manqué : une sortie non
     badgée, un passage manquant. Le geste est quotidien, il appartient à
     celles qui tiennent le registre, la responsable administration et la
     RH. Rien n'est effacé : la correction s'ajoute par-dessus le pointage
     brut, avec son motif et son auteur.

     ACCORDER des heures supplémentaires CRÉE une dette de l'employeur. Des
     heures présentes ne sont pas des heures dues : quelqu'un doit les
     accorder, et ce quelqu'un engage l'ONG. Ce geste-là reste à l'admin. */
  "pointage:corriger": ["admin", "direction", "rh"],
  "pointage:gerer": ["admin"],
  /* COLLECTER n'est pas GÉRER. Récupérer les badgeages depuis la pointeuse
     ou importer le fichier MIARAKA constitue la donnée brute — c'est le
     geste quotidien du poste d'Aliniaina (direction). Corriger un pointage
     ou valider des heures supplémentaires engage la paie et reste à
     l'administrateur. La RH collecte aussi : constituer le registre des
     présences est le cœur de sa fonction. */
  "pointage:collecter": ["admin", "direction", "rh"],
  // Planning — la DIRECTION peut planifier (décision du responsable) : établir
  // un emploi du temps est un acte d'organisation, pas de paie. Corriger un
  // pointage ou valider des heures sup reste en revanche réservé à l'admin.
  "planning:gerer": ["admin", "direction"],
} as const satisfies Record<string, UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole | undefined, perm: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[perm] as readonly UserRole[]).includes(role);
}

export function requires(role: UserRole | undefined, perm: Permission): void {
  if (!can(role, perm)) {
    throw new Error(`Access denied: ${perm} requires role in ${PERMISSIONS[perm].join(", ")}`);
  }
}
