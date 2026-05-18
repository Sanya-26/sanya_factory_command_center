// src/pages/_modules/qc-recovery/IntegrationHealth.tsx
// Integration health monitor + recovery actions
// Ticket: recovery-e2e-auditor-61115444
// All reconnect buttons call the install endpoints — no stubs.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DashboardHeader } from '@/components/layout/DashboardHeader'
import { AnimatedSection } from '@/components/ui/AnimatedSection'
import { ResponsiveCardGrid } from '@/components/ui/ResponsiveCardGrid'
import { AgentEmptyState } from '@/components/ui/AgentEmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import { supabase } from '@/integrations/supabase'
import { auditAndExecute } from '@/lib/auditAndExecute'
import { useIntegrationHealth, getAccessToken } from '@/lib/_modules/qc-recovery/useQCData'
import type { IntegrationStatus } from '@/lib/_modules/qc-recovery/types'
import { cn } from '@/lib/utils'

// ── Install endpoints per vendor (from edge-006 manifest) ─────────────────────
const INSTALL_URLS: Record<string, string> = {
  shopify: '/api/v1/integrations/shopify/install',
  tiktok_shop: '/api/v1/integrations/tiktok-shop/install',
}

// ── Status rendering helpers ──────────────────────────────────────────────────
function statusBadgeVariant(
  status: IntegrationStatus['status']
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'connected') return 'default'
  if (status === 'expired') return 'secondary'
  if (status === 'error') return 'destructive'
  return 'outline'
}

function statusLabel(status: IntegrationStatus['status']): string {
  if (status === 'connected') return 'Connected'
  if (status === 'expired') return 'Token expired'
  if (status === 'error') return 'Error'
  return 'Disconnected'
}

// ── Integration card ──────────────────────────────────────────────────────────
function IntegrationCard({
  integration,
  onReconnect,
  reconnecting,
}: {
  integration: IntegrationStatus
  onReconnect: (vendor: string) => void
  reconnecting: string | null
}) {
  // Fix: explicit type annotation (TypeScript was previously missing this)
  const hasInstallUrl = (vendor: string) => !!INSTALL_URLS[vendor]
  const needsAction =
    integration.status === 'expired' || integration.status === 'disconnected' || integration.status === 'error'
  const isReconnecting = reconnecting === integration.vendor

  return (
    <Card
      className={cn(
        'bg-card border-border transition-colors',
        integration.status === 'error' && 'border-destructive/30',
        integration.status === 'expired' && 'border-accent/30'
      )}
    >
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold text-foreground">
            {integration.label}
          </CardTitle>
          <p className="text-xs text-muted-foreground font-mono">{integration.vendor}</p>
        </div>
        <Badge variant={statusBadgeVariant(integration.status)} className="text-xs shrink-0">
          {statusLabel(integration.status)}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {integration.last_refreshed_at && (
          <p className="text-xs text-muted-foreground">
            Last seen:{' '}
            {new Date(integration.last_refreshed_at).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
        {integration.error_message && (
          <p className="text-xs text-destructive bg-destructive/5 px-2 py-1.5 rounded">
            {integration.error_message}
          </p>
        )}
        {needsAction && hasInstallUrl(integration.vendor) && (
          <Button
            size="sm"
            variant={integration.status === 'error' ? 'destructive' : 'default'}
            className="w-full text-xs"
            disabled={isReconnecting}
            onClick={() => onReconnect(integration.vendor)}
            aria-label={`Reconnect ${integration.label}`}
          >
            {isReconnecting ? 'Redirecting…' : 'Reconnect'}
          </Button>
        )}
        {needsAction && !hasInstallUrl(integration.vendor) && (
          <p className="text-xs text-muted-foreground italic">
            Manual reconnection required — no OAuth flow configured for this vendor.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ── Recent integration events (client_journey_events) ───────────────────────
interface JourneyEvent {
  event_type: string
  created_at: string
  metadata: Record<string, unknown> | null
}

function IntegrationEventsTable() {
  const [events, setEvents] = useState<JourneyEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('client_journey_events')
        .select('event_type, created_at, metadata')
        .in('event_type', ['integration-rotated', 'integration-broken', 'integration-recovered'])
        .order('created_at', { ascending: false })
        .limit(30)
      if (!cancelled) {
        setEvents((data ?? []) as JourneyEvent[])
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded" />
        ))}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <AgentEmptyState
        agent="QC Recovery"
        title="No integration events"
        description="OAuth installs, token refreshes, and auth failures will appear here."
      />
    )
  }

  const eventBadge = (type: string) => {
    if (type === 'integration-rotated') return <Badge variant="default" className="text-xs">rotated</Badge>
    if (type === 'integration-broken') return <Badge variant="destructive" className="text-xs">broken</Badge>
    if (type === 'integration-recovered') return <Badge variant="secondary" className="text-xs">recovered</Badge>
    return <Badge variant="outline" className="text-xs">{type}</Badge>
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-36">Event</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Metadata</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-36">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((ev, i) => (
            <TableRow key={i} className="hover:bg-muted/20">
              <TableCell>{eventBadge(ev.event_type)}</TableCell>
              <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-xs" title={JSON.stringify(ev.metadata)}>
                {ev.metadata ? JSON.stringify(ev.metadata).slice(0, 80) : '—'}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(ev.created_at).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function IntegrationHealth() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { integrations, loading, error, refetch } = useIntegrationHealth()
  const [reconnecting, setReconnecting] = useState<string | null>(null)

  async function handleReconnect(vendor: string) {
    const installPath = INSTALL_URLS[vendor]
    if (!installPath) return

    setReconnecting(vendor)
    try {
      await auditAndExecute(
        `integration.reconnect.${vendor}`,
        { vendor },
        async (signedRequestId) => {
          // Redirect to OAuth install — no JSON response, navigation is the result
          const token = await getAccessToken()
          const url = `${import.meta.env.VITE_HARNESS_URL ?? ''}${installPath}`
          // Fetch install to get redirect URL, then navigate
          const resp = await fetch(url, {
            headers: {
              authorization: `Bearer ${token ?? ''}`,
              'x-request-id': signedRequestId,
            },
            redirect: 'manual',
          })
          if (resp.status === 302 || resp.type === 'opaqueredirect') {
            const location = resp.headers.get('location')
            if (location) window.location.href = location
          } else if (resp.ok) {
            const body = await resp.json().catch(() => ({})) as { redirect_url?: string }
            if (body.redirect_url) window.location.href = body.redirect_url
          }
          return resp
        }
      )
    } catch (e) {
      toast({
        title: `Reconnect failed — ${vendor}`,
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
      setReconnecting(null)
    }
  }

  const connectedCount = integrations.filter((i) => i.status === 'connected').length
  const errorCount = integrations.filter(
    (i) => i.status === 'expired' || i.status === 'error'
  ).length

  return (
    <div data-module="qc-recovery" style={{ display: 'contents' }}>
      <DashboardLayout>
        <DashboardHeader
          title="Integration health"
          subtitle={
            integrations.length > 0
              ? `${connectedCount} of ${integrations.length} connected${errorCount > 0 ? ` · ${errorCount} need attention` : ''}`
              : 'OAuth connection status for all tenant integrations'
          }
          actions={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => refetch()} className="text-sm">
                Refresh
              </Button>
              <Button variant="ghost" onClick={() => navigate('/modules/qc-recovery')}>
                ← Overview
              </Button>
            </div>
          }
        />

        <AnimatedSection className="mt-6 space-y-8">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                Could not load integration status: {error.message}
              </AlertDescription>
            </Alert>
          )}

          {/* Integration cards */}
          {loading ? (
            <ResponsiveCardGrid>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-36 w-full rounded-lg" />
              ))}
            </ResponsiveCardGrid>
          ) : integrations.length === 0 ? (
            <AgentEmptyState
              agent="QC Recovery"
              title="No integrations configured"
              description="OAuth integrations will appear here once the customer_secrets table is populated by the harness."
            />
          ) : (
            <ResponsiveCardGrid>
              {integrations.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  onReconnect={(vendor) => void handleReconnect(vendor)}
                  reconnecting={reconnecting}
                />
              ))}
            </ResponsiveCardGrid>
          )}

          {/* Integration event log */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">
                Integration events
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <IntegrationEventsTable />
            </CardContent>
          </Card>
        </AnimatedSection>
      </DashboardLayout>
    </div>
  )
}
