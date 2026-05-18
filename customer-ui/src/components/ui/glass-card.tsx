import * as React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover3D?: boolean;
  glowColor?: "primary" | "secondary" | "accent";
  intensity?: "low" | "medium" | "high";
}

const glowColors = {
  primary: "hsl(185 100% 50%)",
  secondary: "hsl(290 90% 55%)",
  accent: "hsl(210 100% 55%)",
};

const intensityStyles = {
  low: {
    blur: "blur-[16px]",
    opacity: "opacity-60",
    border: "border-white/5",
  },
  medium: {
    blur: "blur-[20px]",
    opacity: "opacity-70",
    border: "border-gray-200",
  },
  high: {
    blur: "blur-[24px]",
    opacity: "opacity-80",
    border: "border-gray-300",
  },
};

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, children, hover3D = true, glowColor = "primary", intensity = "medium" }, ref) => {
    const [rotateX, setRotateX] = React.useState(0);
    const [rotateY, setRotateY] = React.useState(0);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!hover3D) return;
      
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateXVal = ((y - centerY) / centerY) * -8;
      const rotateYVal = ((x - centerX) / centerX) * 8;
      
      setRotateX(rotateXVal);
      setRotateY(rotateYVal);
    };

    const handleMouseLeave = () => {
      setRotateX(0);
      setRotateY(0);
    };

    return (
      <motion.div
        ref={ref}
        className={cn(
          "relative rounded-2xl overflow-hidden",
          "bg-card/40 backdrop-blur-xl",
          intensityStyles[intensity].border,
          "border",
          "shadow-card",
          "transition-all duration-300 ease-out",
          className
        )}
        style={{
          transformStyle: "preserve-3d",
          transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        whileHover={{
          scale: 1.02,
          boxShadow: `0 0 30px ${glowColors[glowColor]}40, 0 0 60px ${glowColors[glowColor]}20, 0 20px 40px rgba(0,0,0,0.04)`,
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 20,
        }}
      >
        {/* Gradient border glow */}
        <div 
          className="absolute inset-0 rounded-2xl opacity-0 hover:opacity-100 transition-opacity duration-300"
          style={{
            background: `linear-gradient(135deg, ${glowColors[glowColor]}20, transparent, ${glowColors[glowColor]}10)`,
          }}
        />
        
        {/* Inner glow */}
        <div 
          className="absolute inset-0 rounded-2xl opacity-0 hover:opacity-50 transition-opacity duration-500"
          style={{
            background: `radial-gradient(circle at 50% 0%, ${glowColors[glowColor]}15, transparent 50%)`,
          }}
        />

        {/* Content */}
        <div className="relative z-10">
          {children}
        </div>

        {/* Bottom reflection */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </motion.div>
    );
  }
);

GlassCard.displayName = "GlassCard";

// Floating container with parallax effect
interface FloatingContainerProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const FloatingContainer = React.forwardRef<HTMLDivElement, FloatingContainerProps>(
  ({ className, children, delay = 0 }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={cn("relative", className)}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          type: "spring",
          stiffness: 100,
          damping: 15,
          delay,
        }}
      >
        {children}
      </motion.div>
    );
  }
);

FloatingContainer.displayName = "FloatingContainer";

// Animated page wrapper
export const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 1.02, filter: "blur(10px)" }}
      transition={{
        type: "spring",
        stiffness: 100,
        damping: 20,
      }}
    >
      {children}
    </motion.div>
  );
};

// Neon text component
interface NeonTextProps {
  children: React.ReactNode;
  color?: "primary" | "secondary" | "accent";
  className?: string;
}

export const NeonText: React.FC<NeonTextProps> = ({ 
  children, 
  color = "primary",
  className,
}) => {
  return (
    <span
      className={cn(
        "relative inline-block",
        color === "primary" && "text-primary",
        color === "secondary" && "text-secondary",
        color === "accent" && "text-accent",
        className
      )}
      style={{
        textShadow: `0 0 10px ${glowColors[color]}80, 0 0 20px ${glowColors[color]}50, 0 0 40px ${glowColors[color]}30`,
      }}
    >
      {children}
    </span>
  );
};

// Holographic badge
interface HoloBadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error";
  className?: string;
}

export const HoloBadge: React.FC<HoloBadgeProps> = ({
  children,
  variant = "default",
  className,
}) => {
  const variants = {
    default: "bg-primary/20 border-primary/40 text-primary shadow-neon-cyan",
    success: "bg-neon-green/20 border-neon-green/40 text-neon-green",
    warning: "bg-neon-yellow/20 border-neon-yellow/40 text-neon-yellow",
    error: "bg-destructive/20 border-destructive/40 text-destructive",
  };

  return (
    <motion.span
      className={cn(
        "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider",
        "border backdrop-blur-sm",
        variants[variant],
        className
      )}
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      {children}
    </motion.span>
  );
};
