import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Force a dark glassmorphism theme — the dashboard is uniformly dark so
// every Sonner toast (new-canvas, save, error, etc.) should match.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        style: {
          background: "rgba(15, 15, 22, 0.92)",
          border: "1px solid rgba(34, 211, 238, 0.25)",
          color: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(18px) saturate(160%)",
          WebkitBackdropFilter: "blur(18px) saturate(160%)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.45), inset 0 0 0 0.5px rgba(255, 255, 255, 0.08)",
          fontSize: "13px",
        },
        classNames: {
          title: "text-white font-medium",
          description: "text-white/70",
          actionButton: "bg-cyan-400 text-black font-semibold",
          cancelButton: "bg-white/10 text-white/80",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
