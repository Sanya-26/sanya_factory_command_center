import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: 
          "border-primary/30 bg-primary/20 text-primary backdrop-blur-sm shadow-[0_0_10px_hsl(185_100%_50%/0.3)] hover:bg-primary/30 hover:shadow-[0_0_15px_hsl(185_100%_50%/0.5)]",
        secondary: 
          "border-secondary/30 bg-secondary/20 text-secondary backdrop-blur-sm shadow-[0_0_10px_hsl(290_90%_55%/0.3)] hover:bg-secondary/30",
        destructive: 
          "border-destructive/30 bg-destructive/20 text-destructive backdrop-blur-sm shadow-[0_0_10px_hsl(0_85%_55%/0.3)] hover:bg-destructive/30",
        outline: 
          "text-foreground border-border/50 bg-background/30 backdrop-blur-sm hover:border-primary/50 hover:text-primary",
        success:
          "border-neon-green/30 bg-neon-green/20 text-neon-green backdrop-blur-sm shadow-[0_0_10px_hsl(120_80%_50%/0.3)]",
        warning:
          "border-neon-yellow/30 bg-neon-yellow/20 text-neon-yellow backdrop-blur-sm shadow-[0_0_10px_hsl(45_100%_50%/0.3)]",
        accent:
          "border-accent/30 bg-accent/20 text-accent backdrop-blur-sm shadow-[0_0_10px_hsl(210_100%_55%/0.3)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
