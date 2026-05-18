import { ReactNode, useState } from "react";
import { Task } from "@/config/tasksConfig";
import { TaskApprovalOverlay } from "@/components/dashboard/TaskApprovalOverlay";
import { TeamMemberHeader, TeamMember } from "@/components/dashboard/TeamMemberHeader";
import { AnimatePresence } from "framer-motion";

interface Brand {
  id: string;
  name: string;
  product_category?: string;
}

interface TeamDashboardLayoutProps {
  brand: Brand;
  teamMember: TeamMember;
  tasks: Task[];
  onToggleTask: (taskId: number) => void;
  onClearCompletedTasks: () => void;
  children: ReactNode;
  backgroundImage?: string;
  backgroundOverlay?: ReactNode;
  headerActions?: ReactNode;
  leftPanelDefaultCollapsed?: boolean;
  rightPanelDefaultCollapsed?: boolean;
  leftPanelFooter?: ReactNode;
  leftPanelHeader?: ReactNode;
}

export function TeamDashboardLayout({
  brand,
  teamMember,
  tasks,
  onToggleTask,
  children,
  backgroundImage,
  backgroundOverlay,
  headerActions,
}: TeamDashboardLayoutProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
  };

  const handleTaskApprove = () => {
    if (selectedTask) {
      onToggleTask(selectedTask.id);
      setSelectedTask(null);
    }
  };

  const handleTaskDisapprove = () => {
    if (selectedTask) {
      setSelectedTask(null);
    }
  };

  return (
    <div 
      className="h-screen flex flex-col overflow-hidden relative"
      style={{ 
        background: "#ffffff",
        fontFamily: '"Outfit", sans-serif',
        fontWeight: 300,
      }}
    >
      {/* Pure black background with subtle video */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: 0.25, filter: "saturate(0.3)" }}
        >
          {/* TODO: Migrate video to Aubos storage (ikqurywpmpzwzxvqjkfl) */}
          <source src="https://cktzmtulwjklbfxdgdna.supabase.co/storage/v1/object/public/Website%20Media/88c11eb9-2197-672a-02f9-0340b1e37431_custom.mp4" type="video/mp4" />
        </video>
        <div 
          className="absolute inset-0"
          style={{ background: "rgba(255,255,255,0.75)" }}
        />
      </div>
      
      {/* Legacy Background Support */}
      {backgroundImage && (
        <div 
          className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat opacity-20 pointer-events-none z-0"
          style={{ backgroundImage: `url(${backgroundImage})`, filter: "saturate(0.3)" }}
        />
      )}
      {backgroundOverlay && !backgroundImage && backgroundOverlay}

      {/* Team Member Header */}
      <TeamMemberHeader 
        member={teamMember}
        brandName={brand.name}
        actions={headerActions}
      />

      {/* Main Content - Full width */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 relative z-10">
        <div className="w-full space-y-4 lg:space-y-6">
          {children}
        </div>
      </div>

      {/* Task Approval Overlay */}
      <AnimatePresence>
        {selectedTask && (
          <TaskApprovalOverlay
            task={selectedTask}
            onApprove={handleTaskApprove}
            onDisapprove={handleTaskDisapprove}
            onClose={() => setSelectedTask(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
