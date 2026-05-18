// src/lib/auditAndExecute.ts
// Audit-log envelope for UI mutations.
// Writes a row to public.audit_log via fn_audit_log_write RPC
// before and after every counselor / operator action.
// Ticket: recovery-e2e-auditor-61115444

import { supabase } from '@/integrations/supabase'

/**
 * Wrap a UI mutation in an audit envelope.
 *
 * @param action       Canonical action key  e.g. 'compliance_kb.counsel_approve'
 * @param payload      Structured context written to audit_log.after_state
 * @param execute      Async callback that performs the real action.
 *                     Receives a `signedRequestId` (UUID) to forward to
 *                     the backing edge function as `request_id`.
 *
 * Audit writes are non-blocking — they fail silently with a console.warn
 * so a transient DB hiccup never blocks the operator action.
 */
export async function auditAndExecute<T>(
  action: string,
  payload: Record<string, unknown>,
  execute: (signedRequestId: string) => Promise<T>
): Promise<T> {
  const requestId = crypto.randomUUID()

  // Pre-action: fire-and-forget
  supabase
    .rpc('fn_audit_log_write', {
      p_action: `${action}:started`,
      p_after: payload,
      p_request_id: requestId,
    })
    .then(
      () => {},
      (err: unknown) => console.warn('[auditAndExecute] pre-audit write failed:', err)
    )

  try {
    const result = await execute(requestId)

    // Post-action: fire-and-forget
    supabase
      .rpc('fn_audit_log_write', {
        p_action: `${action}:completed`,
        p_after: payload,
        p_request_id: requestId,
      })
      .then(
        () => {},
        (err: unknown) => console.warn('[auditAndExecute] post-audit write failed:', err)
      )

    return result
  } catch (err) {
    // Error audit: best-effort
    supabase
      .rpc('fn_audit_log_write', {
        p_action: `${action}:failed`,
        p_after: { ...payload, error: String(err) },
        p_request_id: requestId,
      })
      .then(() => {}, () => {})

    throw err
  }
}
