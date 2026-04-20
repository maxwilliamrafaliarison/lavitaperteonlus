import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  size = 40,
  showText = true,
}: {
  className?: string;
  size?: number;
  showText?: boolean;
}) {
  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <div
        className="relative rounded-2xl glass overflow-hidden shrink-0"
        style={{ width: size, height: size }}
      >
        <Image
          src="/logo/lavitaperte.jpg"
          alt="La Vita Per Te"
          fill
          sizes="40px"
          className="object-cover"
          priority
        />
      </div>
      {showText && (
        <div className="flex flex-col leading-tight">
          <span className="font-display text-base font-semibold tracking-tight">
            La Vita per Te
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
            ONG-ODV Alfeo Corassori
          </span>
        </div>
      )}
    </div>
  );
}
