import { GlassCard } from "@/components/glass/glass-card";
import { Construction } from "lucide-react";

export function PhaseStub({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <main className="flex-1 p-6 md:p-10">
      <GlassCard className="p-10 max-w-2xl mx-auto text-center">
        <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Construction className="size-6" />
        </div>
        <h2 className="mt-6 font-display text-2xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Disponible en <span className="text-primary font-medium">{phase}</span>
        </p>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </GlassCard>
    </main>
  );
}
