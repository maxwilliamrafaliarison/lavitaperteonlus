import Link from "next/link";
import { GlassCard } from "@/components/glass/glass-card";
import { MaterialTypeIcon } from "./type-icon";
import { StateBadge } from "./state-badge";
import { ObsolescenceBadge } from "./obsolescence-badge";
import { scoreObsolescence } from "@/lib/obsolescence";
import { MATERIAL_TYPE_LABELS, type Material } from "@/types";

interface MaterialCardProps {
  material: Material;
  href?: string;
  lang?: "fr" | "it";
}

export function MaterialCard({ material, href, lang = "fr" }: MaterialCardProps) {
  const obs = scoreObsolescence(material);
  const link = href ?? `/materials/${material.id}`;

  return (
    <Link href={link}>
      <GlassCard interactive className="h-full p-5 group">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary group-hover:bg-primary/20 transition-colors">
              <MaterialTypeIcon type={material.type} className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {MATERIAL_TYPE_LABELS[material.type][lang]}
              </p>
              <p className="font-medium truncate" title={material.designation}>
                {material.designation || material.ref}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <StateBadge state={material.state} lang={lang} size="sm" />
          <ObsolescenceBadge level={obs.level} score={obs.score} lang={lang} size="sm" showScore />
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono">{material.ref}</span>
          {material.brand && <span className="truncate ml-2">{material.brand}</span>}
        </div>
      </GlassCard>
    </Link>
  );
}
