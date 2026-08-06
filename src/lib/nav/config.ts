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

export type AppKey = "logistique" | "pharmacie" | "patients" | "pointage";

export interface NavItemSpec {
  href: string;
  /** Clé i18n du libellé. */
  labelKey: string;
  /** Nom d'icône lucide-react (résolu par nav-icons.ts). */
  icon: string;
  /** Permission requise ; absente = visible pour tout utilisateur de l'app. */
  permission?: Permission;
  /** Clé i18n du groupe : les items d'un même groupe partagent un intitulé
   *  de section — l'œil retrouve « Stock » sans lire chaque entrée. */
  groupeKey?: string;
  /** Entrée dominante de l'app (l'acte du métier), rendue en bouton plein. */
  emphase?: boolean;
  /** Pastilles de compte à afficher (alimentées par le shell serveur). */
  badges?: Array<"ruptures" | "peremptions">;
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
      // Ordonné par fréquence d'usage au comptoir, pas par ordre de
      // construction : la vente domine, le stock se regroupe, le pilotage
      // ferme la marche. Les pastilles préviennent avant le clic.
      { href: "/pharmacie", labelKey: "nav.dashboard", icon: "LayoutDashboard", badges: ["ruptures", "peremptions"] },
      { href: "/pharmacie/vente", labelKey: "pharmacie.vente_cta", icon: "ShoppingCart", permission: "pharmacie:vendre", groupeKey: "pharmacie.grp_vente", emphase: true },
      { href: "/pharmacie/ventes", labelKey: "pharmacie.ventes_cta", icon: "History", groupeKey: "pharmacie.grp_vente" },
      { href: "/pharmacie/reception", labelKey: "pharmacie.reception_cta", icon: "PackagePlus", permission: "pharmacie:stock", groupeKey: "pharmacie.grp_stock", badges: ["ruptures"] },
      { href: "/pharmacie/achats", labelKey: "pharmacie.achats_cta", icon: "ClipboardList", permission: "pharmacie:stock", groupeKey: "pharmacie.grp_stock" },
      { href: "/pharmacie/transfert", labelKey: "pharmacie.transfert_cta", icon: "ArrowLeftRight", permission: "pharmacie:stock", groupeKey: "pharmacie.grp_stock" },
      { href: "/pharmacie/rapports", labelKey: "pharmacie.rapports_cta", icon: "FileBarChart2", permission: "pharmacie:stock", groupeKey: "pharmacie.grp_pilotage", badges: ["peremptions"] },
      // Consultation seule : qui sont nos fournisseurs, comment les joindre.
      { href: "/pharmacie/fournisseurs", labelKey: "pharmacie.fournisseurs_cta", icon: "Truck", groupeKey: "pharmacie.grp_pilotage" },
      { href: "/pharmacie/parametres", labelKey: "pharmacie.param_cta", icon: "Settings", permission: "pharmacie:config", groupeKey: "pharmacie.grp_pilotage" },
      { href: "/pharmacie/aide", labelKey: "pharmacie.nav_aide", icon: "CircleHelp", groupeKey: "pharmacie.grp_pilotage" },
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
  pointage: {
    key: "pointage",
    nameKey: "hub.app_pointage",
    icon: "Fingerprint",
    items: [
      { href: "/pointage", labelKey: "nav.dashboard", icon: "LayoutDashboard" },
      { href: "/pointage/presence", labelKey: "pointage.nav_presence", icon: "UserCheck" },
      { href: "/pointage/etats", labelKey: "pointage.nav_etats", icon: "FileBarChart2" },
      { href: "/pointage/agents", labelKey: "pointage.nav_agents", icon: "Users" },
      { href: "/pointage/planning", labelKey: "pointage.nav_planning", icon: "CalendarDays", permission: "planning:gerer" },
      { href: "/pointage/corrections", labelKey: "pointage.nav_corrections", icon: "ClipboardList", permission: "pointage:gerer" },
      { href: "/pointage/creneaux", labelKey: "pointage.nav_creneaux", icon: "Clock", permission: "pointage:gerer" },
      { href: "/pointage/import", labelKey: "pointage.nav_import", icon: "Upload", permission: "pointage:gerer" },
    ],
  },
};
