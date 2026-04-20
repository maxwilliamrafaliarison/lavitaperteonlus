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
