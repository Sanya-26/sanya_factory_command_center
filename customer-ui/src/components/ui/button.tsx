import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 relative overflow-hidden",
  {
    variants: {
      variant: {
        default: 
          "bg-white text-black font-medium hover:bg-zinc-200 active:scale-[0.98]",
        destructive: 
          "bg-zinc-800 text-zinc-200 hover:bg-zinc-700",
        outline: 
          "border border-[#f3f4f6] bg-transparent hover:bg-white hover:border-zinc-600 text-gray-600",
        secondary: 
          "bg-white text-gray-600 hover:bg-zinc-800",
        ghost: 
          "hover:bg-white hover:text-zinc-100 text-gray-500",
        link: 
          "text-gray-600 underline-offset-4 hover:underline hover:text-gray-900",
        neon:
          "bg-transparent border border-[#f3f4f6] text-gray-600 hover:bg-white hover:border-zinc-500 hover:text-gray-900",
        glass:
          "bg-gray-50 backdrop-blur-xl border border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-lg px-8 text-base",
        icon: "h-10 w-10 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp 
        className={cn(buttonVariants({ variant, size, className }))} 
        ref={ref} 
        {...props} 
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
