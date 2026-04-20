import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const glassButtonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 overflow-hidden active:scale-[0.98]",
  {
    variants: {
      variant: {
        brand:
          "bg-primary text-primary-foreground hover:brightness-110 shadow-lg shadow-primary/30 hover:shadow-primary/50",
        glass:
          "glass text-foreground hover:bg-white/10 border border-white/10",
        cyan: "bg-accent text-accent-foreground hover:brightness-110 shadow-lg shadow-accent/30",
        ghost: "text-foreground hover:bg-white/5",
      },
      size: {
        sm: "h-9 px-4",
        md: "h-11 px-6",
        lg: "h-14 px-8 text-base",
      },
    },
    defaultVariants: {
      variant: "brand",
      size: "md",
    },
  },
);

export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButtonVariants> {
  shimmer?: boolean;
}

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant, size, shimmer = false, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          glassButtonVariants({ variant, size }),
          shimmer && "shimmer",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
GlassButton.displayName = "GlassButton";
