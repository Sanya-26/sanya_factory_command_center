import { useEffect, useMemo, useState } from "react";

// Inlined from @factory/kernel/types — that package is workspace-only in
// the AI_Factory monorepo and not published to npm, so we mirror its
// type here to keep this deploy repo standalone-buildable.
type WorkStreamEventKind =
  | "stage" | "agent" | "audit" | "qc" | "debug" | "context" | "delivery" | "scaling";

interface WorkStreamEvent {
  id: string;
  projectId: string;
  agentId?: string;
  stageId?: string;
  kind: WorkStreamEventKind;
  status: "queued" | "running" | "blocked" | "debugging" | "passed" | "failed" | "delivered";
  title: string;
  message: string;
  progress: number;
  evidence?: Record<string, unknown>;
  createdAt: string;
}

interface WorkStreamRow {
  id: string;
  project_id: string;
  agent_instance_id?: string | null;
  lifecycle_stage_slug?: WorkStreamEvent["stageId"] | null;
  event_kind: WorkStreamEvent["kind"];
  status: WorkStreamEvent["status"];
  title: string;
  message: string;
  progress: number;
  evidence?: Record<string, unknown> | null;
  created_at: string;
}

function normalizeRow(row: WorkStreamRow): WorkStreamEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    agentId: row.agent_instance_id ?? undefined,
    stageId: row.lifecycle_stage_slug ?? undefined,
    kind: row.event_kind,
    status: row.status,
    title: row.title,
    message: row.message,
    progress: row.progress,
    evidence: row.evidence ?? undefined,
    createdAt: row.created_at
  };
}

function sortEvents(events: WorkStreamEvent[]): WorkStreamEvent[] {
  return [...events]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 24);
}

export function useSupabaseProgressStream(projectIds: string[], fallbackEvents: WorkStreamEvent[]) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);
  const projectKey = useMemo(() => projectIds.join("|"), [projectIds]);
  const [events, setEvents] = useState<WorkStreamEvent[]>(() => sortEvents(fallbackEvents));

  useEffect(() => {
    setEvents(sortEvents(fallbackEvents));
  }, [fallbackEvents]);

  useEffect(() => {
    if (isConfigured || fallbackEvents.length === 0) {
      return undefined;
    }

    let index = 0;
    const interval = window.setInterval(() => {
      const source = fallbackEvents[index % fallbackEvents.length];
      index += 1;
      const nextEvent: WorkStreamEvent = {
        ...source,
        id: `${source.id}-local-${Date.now()}`,
        status: source.status === "queued" ? "running" : source.status,
        progress: Math.min(96, source.progress + index * 5),
        createdAt: new Date().toISOString()
      };
      setEvents((current) => sortEvents([nextEvent, ...current]));
    }, 2600);

    return () => window.clearInterval(interval);
  }, [fallbackEvents, isConfigured]);

  useEffect(() => {
    if (!isConfigured || projectIds.length === 0) {
      return undefined;
    }

    const allowedProjects = new Set(projectIds);
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void import("@supabase/supabase-js").then(({ createClient }) => {
      if (cancelled) {
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const channel = supabase
        .channel("aubos-project-work-stream")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "project_work_stream_events" },
          (payload) => {
            const event = normalizeRow(payload.new as WorkStreamRow);
            if (allowedProjects.has(event.projectId)) {
              setEvents((current) => sortEvents([event, ...current]));
            }
          }
        )
        .subscribe();

      cleanup = () => {
        void supabase.removeChannel(channel);
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [isConfigured, projectIds, projectKey, supabaseAnonKey, supabaseUrl]);

  return {
    events,
    source: isConfigured ? "Supabase realtime" : "Local demo stream",
    isLive: isConfigured
  };
}
