import * as React from "react";
import { cn } from "@/lib/utils";

export interface Y2KButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "silver";
  size?: "default" | "sm" | "lg";
}

const Y2KButton = React.forwardRef<HTMLButtonElement, Y2KButtonProps>(
  ({ className, variant = "primary", size = "default", children, ...props }, ref) => {
    const baseClasses = "inline-flex items-center justify-center font-semibold transition-all duration-300 relative overflow-hidden disabled:pointer-events-none disabled:opacity-50";
    
    const variantClasses = {
      primary: "y2k-button",
      secondary: "bg-[hsl(200,20%,94%/0.8)] border-2 border-[hsl(185,35%,70%)] text-[hsl(185,45%,35%)] hover:border-[hsl(185,50%,55%)] hover:bg-[hsl(200,22%,96%)] hover:shadow-[0_4px_20px_hsl(185,45%,45%/0.15)] rounded-[50px]",
      silver: "y2k-silver text-[hsl(210,30%,40%)] hover:scale-105",
    };
    
    const sizeClasses = {
      default: "px-6 py-2.5 text-sm",
      sm: "px-4 py-2 text-xs",
      lg: "px-8 py-3 text-base",
    };

    return (
      <button
        className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Y2KButton.displayName = "Y2KButton";

export { Y2KButton };
