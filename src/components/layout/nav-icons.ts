import {
  LayoutDashboard,
  Building2,
  Cpu,
  ArrowLeftRight,
  FileBarChart2,
  Users,
  Trash2,
  ScrollText,
  Settings,
  ShoppingCart,
  History,
  PackagePlus,
  ClipboardList,
  Boxes,
  Pill,
  HeartPulse,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";

/* Résout un nom d'icône (config nav, données sérialisables) vers le
   composant lucide correspondant. Toute icône utilisée dans APP_NAV doit
   figurer ici — sinon on retombe sur un carré neutre plutôt que planter. */
export const NAV_ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Building2,
  Cpu,
  ArrowLeftRight,
  FileBarChart2,
  Users,
  Trash2,
  ScrollText,
  Settings,
  ShoppingCart,
  History,
  PackagePlus,
  ClipboardList,
  Boxes,
  Pill,
  HeartPulse,
  LayoutGrid,
};

export function navIcon(name: string): LucideIcon {
  return NAV_ICONS[name] ?? LayoutGrid;
}
