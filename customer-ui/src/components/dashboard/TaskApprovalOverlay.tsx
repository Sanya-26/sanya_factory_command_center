import type { Task } from "@/config/tasksConfig";

export function TaskApprovalOverlay({
  task,
  onApprove,
  onDisapprove,
  onClose,
}: {
  task: Task;
  onApprove: () => void;
  onDisapprove: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
      <div className="w-full max-w-md rounded-lg border border-black/10 bg-white p-5 shadow-xl">
        <h2 className="text-sm font-semibold text-gray-950">{task.title}</h2>
        {task.description ? <p className="mt-2 text-sm text-gray-500">{task.description}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-md border border-gray-200 px-3 py-1.5 text-xs" onClick={onClose}>Close</button>
          <button className="rounded-md border border-gray-200 px-3 py-1.5 text-xs" onClick={onDisapprove}>Reject</button>
          <button className="rounded-md bg-black px-3 py-1.5 text-xs text-white" onClick={onApprove}>Approve</button>
        </div>
      </div>
    </div>
  );
}
