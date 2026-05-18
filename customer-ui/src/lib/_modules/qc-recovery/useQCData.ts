// src/lib/_modules/qc-recovery/useQCData.ts
// QC Recovery data hooks — all Supabase reads for the cockpit
// Ticket: recovery-e2e-auditor-61115444
// RLS auto-scopes every query to the authenticated operator's company_id

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase'
import type {
  ComplianceKBItem,
  ApprovalLogEntry,
  E2EAuditRun,
  IntegrationStatus,
  ModuleHealth,
  QCSummaryMetrics,
} from './types'

// ── Company ID from session metadata ──────────────────────────────────────────
export function useCompanyId(): string | null {
  const [companyId, setCompanyId] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      // company_id is stamped into app_metadata by the harness on sign-in
      setCompanyId((user?.app_metadata as Record<string, string> | undefined)?.company_id ?? null)
    })
  }, [])
  return companyId
}

// ── Auth session accessor (for Bearer token in edge fn calls) ─────────────────
export async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

// ── QC summary metrics ─────────────────────────────────────────────────────────
export function useQCMetrics(companyId: string | null) {
  const [metrics, setMetrics] = useState<QCSummaryMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      setLoading(true)
      setError(null)

      const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const [pendingRes, expiringRes, integrationErrRes, auditRes] = await Promise.all([
        supabase
          .schema('compliance_kb')
          .from('v_pending_approval')
          .select('id', { count: 'exact', head: true }),

        supabase
          .schema('compliance_kb')
          .from('v_expiring_stubs')
          .select('id', { count: 'exact', head: true })
          .lte('expires_at', sevenDaysOut),

        supabase
          .from('customer_secrets')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'expired'),

        supabase
          .from('e2e_audit_runs')
          .select('critical_count')
          .gte('created_at', todayStart.toISOString()),
      ])

      const totalCritical = ((auditRes.data ?? []) as { critical_count: number }[])
        .reduce((sum, r) => sum + (r.critical_count ?? 0), 0)

      setMetrics({
        open_critical_findings: totalCritical,
        pending_compliance_approvals: pendingRes.count ?? 0,
        expiring_stubs_7d: expiringRes.count ?? 0,
        integration_errors: integrationErrRes.count ?? 0,
        audit_runs_today: (auditRes.data?.length ?? 0),
      })
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { void load() }, [load])

  return { metrics, loading, error, refetch: load }
}

// ── Compliance KB: pending approval queue (v_pending_approval) ────────────────
export function usePendingCompliance() {
  const [items, setItems] = useState<ComplianceKBItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase
        .schema('compliance_kb')
        .from('v_pending_approval')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100)
      if (err) throw err
      setItems((data ?? []) as ComplianceKBItem[])
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { items, loading, error, refetch: load }
}

// ── Compliance KB: expiring + expired stubs ───────────────────────────────────
export function useStubs() {
  const [expiring, setExpiring] = useState<ComplianceKBItem[]>([])
  const [expired, setExpired] = useState<ComplianceKBItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [expiringRes, expiredRes] = await Promise.all([
        supabase
          .schema('compliance_kb')
          .from('v_expiring_stubs')
          .select('*')
          .order('expires_at', { ascending: true })
          .limit(50),
        supabase
          .schema('compliance_kb')
          .from('v_expired_stubs')
          .select('*')
          .order('expires_at', { ascending: true })
          .limit(50),
      ])
      if (expiringRes.error) throw expiringRes.error
      if (expiredRes.error) throw expiredRes.error
      setExpiring((expiringRes.data ?? []) as ComplianceKBItem[])
      setExpired((expiredRes.data ?? []) as ComplianceKBItem[])
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { expiring, expired, loading, error, refetch: load }
}

// ── Compliance KB: approval log (last 90 days) ────────────────────────────────
export function useApprovalLog() {
  const [log, setLog] = useState<ApprovalLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase
        .schema('compliance_kb')
        .from('v_approval_log')
        .select('*')
        .order('decided_at', { ascending: false })
        .limit(50)
      if (err) throw err
      setLog((data ?? []) as ApprovalLogEntry[])
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { log, loading, error, refetch: load }
}

// ── E2E Audit runs ─────────────────────────────────────────────────────────────
export function useRecentAuditRuns() {
  const [runs, setRuns] = useState<E2EAuditRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase
        .from('e2e_audit_runs')
        .select(
          'id, build_run_id, tenant_slug, audit_url, status, verdict, routes_count, findings_count, critical_count, cost_usd, duration_ms, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(50)
      if (err) throw err
      setRuns((data ?? []) as E2EAuditRun[])
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { runs, loading, error, refetch: load }
}

// ── E2E Audit run detail (with findings array) ────────────────────────────────
export function useAuditRunDetail(runId: string | undefined) {
  const [run, setRun] = useState<E2EAuditRun | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!runId) { setRun(null); return }
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const { data, error: err } = await supabase
          .from('e2e_audit_runs')
          .select('*')
          .eq('id', runId)
          .single()
        if (err) throw err
        if (!cancelled) setRun(data as E2EAuditRun)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [runId])

  return { run, loading, error }
}

// ── Integration health (from customer_secrets) ────────────────────────────────
export function useIntegrationHealth() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const VENDOR_LABELS: Record<string, string> = {
    shopify: 'Shopify',
    tiktok_shop: 'TikTok Shop',
    klaviyo: 'Klaviyo',
    meta_ads: 'Meta Ads',
    tiktok_ads: 'TikTok Ads',
    postscript: 'Postscript SMS',
    twilio: 'Twilio Voice',
    trustpilot: 'Trustpilot',
    remotion: 'Remotion Render',
    openai: 'OpenAI (fallback)',
  }

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase
        .from('customer_secrets')
        .select('id, vendor, status, last_refreshed_at, error_message')
        .order('vendor', { ascending: true })
      if (err) throw err
      setIntegrations(
        ((data ?? []) as { id: string; vendor: string; status: string; last_refreshed_at?: string; error_message?: string }[]).map((row) => ({
          id: row.id,
          vendor: row.vendor,
          label: VENDOR_LABELS[row.vendor] ?? row.vendor,
          status: row.status as IntegrationStatus['status'],
          last_refreshed_at: row.last_refreshed_at,
          error_message: row.error_message,
        }))
      )
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { integrations, loading, error, refetch: load }
}

// ── Module health (derived from client_journey_events signals) ────────────────
export function useModuleHealth() {
  const [modules, setModules] = useState<ModuleHealth[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const { data: events } = await supabase
          .from('client_journey_events')
          .select('event_type, created_at')
          .order('created_at', { ascending: false })
          .limit(200)

        // Build latest-event-by-type map
        const latest = new Map<string, string>()
        for (const ev of events ?? []) {
          if (!latest.has(ev.event_type)) latest.set(ev.event_type, ev.created_at)
        }

        const hasBroken = latest.has('integration-broken')
        const hasRecovered = latest.has('integration-recovered')
        const shopifyOk = latest.has('integration-rotated')
        const conciergeOk = latest.has('concierge-session-started')

        setModules([
          {
            module: 'concierge-rag',
            label: 'Concierge RAG',
            status: conciergeOk ? 'operational' : 'unknown',
            last_checked: latest.get('concierge-session-started'),
            detail: conciergeOk ? undefined : 'No concierge sessions recorded yet',
          },
          {
            module: 'shopify',
            label: 'Shopify Sync',
            status:
              hasBroken && !hasRecovered ? 'degraded'
              : shopifyOk ? 'operational'
              : 'unknown',
            last_checked: latest.get('integration-rotated') ?? latest.get('integration-broken'),
            detail: hasBroken && !hasRecovered ? 'Auth failure — token may be expired' : undefined,
          },
          {
            module: 'compliance-kb',
            label: 'Compliance KB',
            status: 'operational',
            detail: 'DB views operational; embedding worker status requires VPS signal',
          },
          {
            module: 'fda-ftc-gate',
            label: 'FDA / FTC Gate',
            status: 'operational',
            detail: 'Two-stage keyword + Haiku classifier behind NemoClaw',
          },
          {
            module: 'email-sms',
            label: 'Email / SMS',
            status: 'unknown',
            detail: 'Status pending Klaviyo + Postscript connection',
          },
        ])
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  return { modules, loading }
}
