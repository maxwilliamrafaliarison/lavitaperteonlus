import type { Permission } from "@/lib/auth/permissions";

/* ============================================================
   NAVIGATION DES APPLICATIONS — source unique, pilotée par données
   ============================================================

   Une seule déclaration par app, partagée par la sidebar (desktop) et le
   drawer mobile — fini la double source de vérité (le NAV logistique était
   copié à l'identique dans app-sidebar.tsx ET mobile-nav.tsx).

   Volontairement SANS composant d'icône : `icon` est un NOM (résolu côté
   client via nav-icons.ts). Ces données traversent ainsi la frontière
   serveur→client sans souci de sérialisation, et le filtrage par rôle se
   fait côté serveur (can()) avant d'atteindre le composant client.

   Ajouter une application = ajouter une entrée ici + un layout de 3 lignes
   qui rend <AppShell appKey=…>. Rien d'autre. */

export type AppKey = "logistique" | "pharmacie" | "patients";

export interface NavItemSpec {
  href: string;
  /** Clé i18n du libellé. */
  labelKey: string;
  /** Nom d'icône lucide-react (résolu par nav-icons.ts). */
  icon: string;
  /** Permission requise ; absente = visible pour tout utilisateur de l'app. */
  permission?: Permission;
}

export interface AppNav {
  key: AppKey;
  /** Clé i18n du nom de l'app (badge d'identité en tête de sidebar). */
  nameKey: string;
  /** Icône d'identité de l'app. */
  icon: string;
  items: NavItemSpec[];
}

export const APP_NAV: Record<AppKey, AppNav> = {
  logistique: {
    key: "logistique",
    nameKey: "hub.app_logistique",
    icon: "Boxes",
    items: [
      { href: "/dashboard", labelKey: "nav.dashboard", icon: "LayoutDashboard" },
      { href: "/sites", labelKey: "nav.sites", icon: "Building2" },
      { href: "/materials", labelKey: "nav.materials", icon: "Cpu" },
      { href: "/movements", labelKey: "nav.movements", icon: "ArrowLeftRight" },
      { href: "/reports", labelKey: "nav.reports", icon: "FileBarChart2" },
      { href: "/users", labelKey: "nav.users", icon: "Users", permission: "user:update" },
      { href: "/trash", labelKey: "nav.trash", icon: "Trash2", permission: "trash:read" },
      { href: "/audit", labelKey: "nav.audit", icon: "ScrollText", permission: "audit:read" },
      { href: "/settings", labelKey: "nav.settings", icon: "Settings" },
    ],
  },
  pharmacie: {
    key: "pharmacie",
    nameKey: "hub.app_pharmacie",
    icon: "Pill",
    items: [
      { href: "/pharmacie", labelKey: "nav.dashboard", icon: "LayoutDashboard" },
      { href: "/pharmacie/vente", labelKey: "pharmacie.vente_cta", icon: "ShoppingCart", permission: "pharmacie:vendre" },
      { href: "/pharmacie/ventes", labelKey: "pharmacie.ventes_cta", icon: "History" },
      { href: "/pharmacie/reception", labelKey: "pharmacie.reception_cta", icon: "PackagePlus", permission: "pharmacie:stock" },
      { href: "/pharmacie/achats", labelKey: "pharmacie.achats_cta", icon: "ClipboardList", permission: "pharmacie:stock" },
      { href: "/pharmacie/transfert", labelKey: "pharmacie.transfert_cta", icon: "ArrowLeftRight", permission: "pharmacie:stock" },
      { href: "/pharmacie/rapports", labelKey: "pharmacie.rapports_cta", icon: "FileBarChart2", permission: "pharmacie:stock" },
      { href: "/pharmacie/parametres", labelKey: "pharmacie.param_cta", icon: "Settings", permission: "pharmacie:config" },
    ],
  },
  patients: {
    key: "patients",
    nameKey: "hub.app_patients",
    icon: "HeartPulse",
    items: [
      { href: "/patients", labelKey: "nav.patients_dossiers", icon: "Users", permission: "app:patients" },
    ],
  },
};
