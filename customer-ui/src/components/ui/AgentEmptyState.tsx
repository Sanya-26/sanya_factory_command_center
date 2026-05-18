import { Inbox } from "lucide-react";

interface AgentEmptyStateProps {
  agent: string;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  minHeight?: string;
}

/**
 * Generic empty state for agent-owned dashboard sections.
 *
 * Use when a hook returns null/[]/empty and you want an honest
 * "no data yet" instead of hardcoded mock data leaking into the UI
 * (which was the Joy-for-Gameday bug).
 *
 * Pattern matches BobEmptyState — same card, same typography, same icon
 * placement — so agents visually agree on what "empty" looks like.
 */
export function AgentEmptyState({
  agent,
  title,
  description,
  icon,
  minHeight = "320px",
}: AgentEmptyStateProps) {
  const resolvedTitle = title ?? `${agent} hasn't gathered data yet`;
  const resolvedDescription =
    description ??
    `Connect the relevant integration, or wait for ${agent}'s next scheduled run to populate this view.`;

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-8 py-12 text-center"
      style={{ minHeight }}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <h3 className="text-base font-semibold text-foreground">{resolvedTitle}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{resolvedDescription}</p>
    </div>
  );
}
