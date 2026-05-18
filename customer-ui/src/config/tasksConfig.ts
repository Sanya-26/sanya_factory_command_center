export interface Task {
  id: number;
  title: string;
  description?: string;
  completed?: boolean;
  priority?: "low" | "normal" | "high" | "urgent";
}
