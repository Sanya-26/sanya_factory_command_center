// voiceTelemetry — fire-and-forget per-stage timing logger for the voice loop
// (proposal §6.4 / S3).
//
// Each turn is a session_id (UUID). Stages fire in order; we log the delta
// from the previous stage (or from session start). The owner-INSERT RLS
// policy on voice_session_log lets the browser write directly using the
// anon key — no edge fn round-trip per stage, which would itself add latency.
//
// NO AUDIO STORED. Only stage names, timings, and small metadata blobs.
// Per §8 #5 (customer expectations + privacy), the metadata blob is empty by
// default; callers can opt in to small informational fields (model id,
// language, retry count) but never PII.

import { supabase } from "@/integrations/supabase";

export type VoiceStage =
  | "mic-start"
  | "first-audio-chunk"
  | "stt-partial"
  | "stt-final"
  | "chat-request"
  | "chat-first-token"
  | "chat-final"
  | "tts-request"
  | "tts-first-byte"
  | "playback-start"
  | "turn-complete";

export interface VoiceTurn {
  session_id: string;
  company_id: string;
  /** Wall-clock start, used to compute per-stage deltas. */
  startedAt: number;
  /** Last stage's timestamp — duration_ms is delta from previous, not absolute. */
  lastStageAt: number;
  /** Record one stage. Fire-and-forget; errors are logged but never thrown. */
  log: (stage: VoiceStage, metadata?: Record<string, unknown>) => void;
}

export function startVoiceTurn(companyId: string): VoiceTurn {
  const sessionId = crypto.randomUUID();
  const startedAt = performance.now();
  const turn: VoiceTurn = {
    session_id: sessionId,
    company_id: companyId,
    startedAt,
    lastStageAt: startedAt,
    log: (stage, metadata) => {
      const now = performance.now();
      const durationMs = Math.max(0, Math.round(now - turn.lastStageAt));
      turn.lastStageAt = now;
      // Fire and forget. Never blocks.
      void (async () => {
        try {
          const { error } = await supabase.from("voice_session_log").insert({
            company_id: companyId,
            session_id: sessionId,
            stage,
            duration_ms: durationMs,
            metadata: metadata ?? {},
          });
          if (error) {
            console.warn(`[voiceTelemetry] log ${stage} failed:`, error.message);
          }
        } catch (e) {
          console.warn(`[voiceTelemetry] log ${stage} threw:`, (e as Error).message);
        }
      })();
    },
  };
  return turn;
}
