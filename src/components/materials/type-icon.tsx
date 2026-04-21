import {
  Monitor,
  Laptop,
  Database,
  Printer,
  Scan,
  Router,
  Network,
  Wifi,
  Smartphone,
  Server,
  Tv,
  Cable,
  Cpu,
  BatteryCharging,
  type LucideIcon,
} from "lucide-react";
import type { MaterialType } from "@/types";

const TYPE_ICONS: Record<MaterialType, LucideIcon> = {
  ordinateur_fixe: Monitor,
  ordinateur_portable: Laptop,
  ordinateur_bdd: Database,
  imprimante: Printer,
  scanner: Scan,
  routeur: Router,
  switch: Network,
  box: Wifi,
  telephone: Smartphone,
  serveur: Server,
  ecran: Tv,
  onduleur: BatteryCharging,
  peripherique: Cable,
  autre: Cpu,
};

export function MaterialTypeIcon({
  type,
  className,
}: {
  type: MaterialType;
  className?: string;
}) {
  const Icon = TYPE_ICONS[type] ?? Cpu;
  return <Icon className={className} />;
}
