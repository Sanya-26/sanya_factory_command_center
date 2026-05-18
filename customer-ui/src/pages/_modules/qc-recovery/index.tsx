// src/pages/_modules/qc-recovery/index.tsx
// QC Recovery cockpit — main health overview
// Ticket: recovery-e2e-auditor-61115444
// Aesthetic: luxury / refined — surgical precision meets botanical depth
// Motion: ONE staggered page-load (KPI strip 0ms → health grid 150ms → panels 300ms), ~1.2s total

import '@/styles/modules/qc-recovery.css'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DashboardHeader } from '@/components/layout/DashboardHeader'
import { ResponsiveCardGrid } from '@/components/ui/ResponsiveCardGrid'
import { AnimatedSection } from '@/components/ui/AnimatedSection'
import { MetricCard } from '@/components/ui/MetricCard'
import { KPICounter } from '@/components/ui/KPICounter'
import { AgentEmptyState } from '@/components/ui/AgentEmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useCompanyId,
  useQCMetrics,
  usePendingCompliance,
  useRecentAuditRuns,
  useModuleHealth,
} from '@/lib/_modules/qc-recovery/useQCData'
import { cn } from '@/lib/utils'
import type { ModuleHealth, E2EAuditRun } from '@/lib/_modules/qc-recovery/types'

// ── Motion variants ────────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number], delay },
  }),
}

const kpiStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0 } },
}

// ── Status dot ────────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: ModuleHealth['status'] }) {
  const cls: Record<ModuleHealth['status'], string> = {
    operational: 'bg-primary',
    degraded: 'bg-accent',
    down: 'bg-destructive',
    unknown: 'bg-muted-foreground/50',
  }
  return (
    <span
      className={cn('inline-block shrink-0 w-2 h-2 rounded-full mr-2.5', cls[status])}
      aria-hidden="true"
    />
  )
}

// ── Module health row ─────────────────────────────────────────────────────────
function ModuleHealthRow({
  module: mod,
  onClick,
}: {
  module: ModuleHealth
  onClick: () => void
}) {
  const badgeVariant =
    mod.status === 'operational' ? 'default'
    : mod.status === 'degraded' ? 'secondary'
    : mod.status === 'down' ? 'destructive'
    : 'outline'

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between w-full px-3 py-2.5 rounded-md hover:bg-primary/5 transition-colors text-left group cursor-pointer"
      data-module-health={mod.module}
      title={mod.detail}
      aria-label={`${mod.label}: ${mod.status}`}
    >
      <span className="flex items-center text-sm text-foreground font-medium truncate pr-2">
        <StatusDot status={mod.status} />
        {mod.label}
      </span>
      <Badge variant={badgeVariant} className="text-xs shrink-0 capitalize">
        {mod.status}
      </Badge>
    </button>
  )
}

// ── Audit run summary card body ───────────────────────────────────────────────
function AuditRunSummary({
  run,
  onClick,
}: {
  run: E2EAuditRun
  onClick: () => void
}) {
  const verdictVariant =
    run.verdict === 'approved' ? 'default'
    : run.verdict === 'ship-with-flag' ? 'secondary'
    : 'destructive'

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left space-y-3.5 p-3 rounded-md hover:bg-primary/5 transition-colors cursor-pointer"
      aria-label={`Audit run: ${run.verdict}, ${run.critical_count} critical findings`}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant={verdictVariant} className="capitalize">
          {run.verdict}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {new Date(run.created_at).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xl font-semibold text-foreground tabular-nums">
            {run.routes_count}
          </div>
          <div className="text-xs text-muted-foreground">routes</div>
        </div>
        <div>
          <div className="text-xl font-semibold text-foreground tabular-nums">
            {run.findings_count}
          </div>
          <div className="text-xs text-muted-foreground">findings</div>
        </div>
        <div>
          <div
            className={cn(
              'text-xl font-semibold tabular-nums',
              run.critical_count > 0 ? 'text-destructive' : 'text-foreground'
            )}
          >
            {run.critical_count}
          </div>
          <div className="text-xs text-muted-foreground">critical</div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-3">
        <span>{Math.round(run.duration_ms / 1000)}s duration</span>
        {run.cost_usd != null && <span>${run.cost_usd.toFixed(3)} cost</span>}
      </div>
    </button>
  )
}

// ── Main dashboard ─────────────────────────────────────────────────────────────
export default function QCRecoveryDashboard() {
  const navigate = useNavigate()
  const companyId = useCompanyId()

  const { metrics, loading: metricsLoading } = useQCMetrics(companyId)
  const { items: pendingItems, loading: pendingLoading } = usePendingCompliance()
  const { runs: auditRuns, loading: auditLoading } = useRecentAuditRuns()
  const { modules, loading: modulesLoading } = useModuleHealth()

  const latestRun = auditRuns[0]

  return (
    // data-module scopes the qc-recovery.css selectors
    <div data-module="qc-recovery" style={{ display: 'contents' }}>
      <DashboardLayout>
        {/* Page header */}
        <DashboardHeader
          title="QC &amp; Recovery"
          subtitle="Build health, compliance approvals, and integration recovery — centralized."
          actions={
            <Button
              variant="default"
              onClick={() => navigate('/modules/qc-recovery/audit')}
            >
              Audit findings
            </Button>
          }
        />

        {/* KPI strip — staggered entrance */}
        <motion.div
          className="mt-6"
          initial="hidden"
          animate="visible"
          variants={kpiStagger}
        >
          <ResponsiveCardGrid>
            {metricsLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <motion.div key={i} variants={fadeUp} custom={i * 0.05}>
                  <Skeleton className="h-28 w-full rounded-lg" />
                </motion.div>
              ))
            ) : (
              <>
                <motion.div variants={fadeUp} custom={0}>
                  <MetricCard
                    label="Critical findings"
                    value={<KPICounter to={metrics?.open_critical_findings ?? 0} />}
                    trend={metrics?.open_critical_findings === 0 ? '✓ clear' : `${metrics?.open_critical_findings} open`}
                  />
                </motion.div>
                <motion.div variants={fadeUp} custom={0.07}>
                  <MetricCard
                    label="Pending approvals"
                    value={<KPICounter to={metrics?.pending_compliance_approvals ?? 0} />}
                    trend={metrics?.pending_compliance_approvals === 0 ? '✓ none' : 'counsel required'}
                  />
                </motion.div>
                <motion.div variants={fadeUp} custom={0.14}>
                  <MetricCard
                    label="Stubs expiring (7d)"
                    value={<KPICounter to={metrics?.expiring_stubs_7d ?? 0} />}
                    trend={metrics?.expiring_stubs_7d === 0 ? '✓ none' : 'run scout v2'}
                  />
                </motion.div>
                <motion.div variants={fadeUp} custom={0.21}>
                  <MetricCard
                    label="Integration errors"
                    value={<KPICounter to={metrics?.integration_errors ?? 0} />}
                    trend={metrics?.integration_errors === 0 ? '✓ all connected' : 'token expired'}
                  />
                </motion.div>
                <motion.div variants={fadeUp} custom={0.28}>
                  <MetricCard
                    label="Audit runs today"
                    value={<KPICounter to={metrics?.audit_runs_today ?? 0} />}
                    trend="e2e passes"
                  />
                </motion.div>
              </>
            )}
          </ResponsiveCardGrid>
        </motion.div>

        {/* Three-panel row */}
        <AnimatedSection className="mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Module health */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 border-b border-border">
                <CardTitle className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">
                  Module health
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3 space-y-0.5">
                {modulesLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full rounded-md" />
                  ))
                ) : modules.length === 0 ? (
                  <AgentEmptyState
                    agent="QC Recovery"
                    title="No signals yet"
                    description="Module health is derived from runtime signals. Signals will appear once the system is live."
                  />
                ) : (
                  modules.map((mod) => (
                    <ModuleHealthRow
                      key={mod.module}
                      module={mod}
                      onClick={() => {
                        if (mod.module === 'shopify' || mod.module === 'email-sms') {
                          void navigate('/modules/qc-recovery/integrations')
                        } else if (mod.module === 'compliance-kb') {
                          void navigate('/modules/qc-recovery/compliance')
                        } else {
                          void navigate('/modules/qc-recovery/audit')
                        }
                      }}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            {/* Compliance queue preview */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 border-b border-border flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">
                  Compliance queue
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground -mr-1 h-auto py-1"
                  onClick={() => navigate('/modules/qc-recovery/compliance')}
                >
                  View all →
                </Button>
              </CardHeader>
              <CardContent className="pt-3 space-y-1">
                {pendingLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                  ))
                ) : pendingItems.length === 0 ? (
                  <AgentEmptyState
                    agent="QC Recovery"
                    title="All clear"
                    description="No items awaiting counsel approval."
                  />
                ) : (
                  pendingItems.slice(0, 6).map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => navigate('/modules/qc-recovery/compliance')}
                      className="flex flex-col items-start w-full px-3 py-2.5 rounded-md hover:bg-primary/5 transition-colors text-left cursor-pointer"
                      aria-label={`Compliance item: ${item.framework} / ${item.claim_type}`}
                    >
                      <span className="text-xs font-semibold text-foreground truncate w-full">
                        {item.framework} · {item.claim_type}
                      </span>
                      <span className="text-xs text-muted-foreground mt-0.5">
                        {item.stub
                          ? `Stub — expires ${item.expires_at ? new Date(item.expires_at).toLocaleDateString() : 'soon'}`
                          : 'Pending counsel review'}
                      </span>
                    </button>
                  ))
                )}
                {!pendingLoading && pendingItems.length > 6 && (
                  <button
                    type="button"
                    onClick={() => navigate('/modules/qc-recovery/compliance')}
                    className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors text-center cursor-pointer"
                  >
                    +{pendingItems.length - 6} more — view all
                  </button>
                )}
              </CardContent>
            </Card>

            {/* Latest audit run */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 border-b border-border flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">
                  Latest audit
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground -mr-1 h-auto py-1"
                  onClick={() => navigate('/modules/qc-recovery/audit')}
                >
                  All runs →
                </Button>
              </CardHeader>
              <CardContent className="pt-3">
                {auditLoading ? (
                  <Skeleton className="h-40 w-full rounded-md" />
                ) : !latestRun ? (
                  <AgentEmptyState
                    agent="QC Recovery"
                    title="No audit runs yet"
                    description="E2E audit results will appear here after the first Playwright pass."
                  />
                ) : (
                  <AuditRunSummary
                    run={latestRun}
                    onClick={() => navigate(`/modules/qc-recovery/audit/${latestRun.id}`)}
                  />
                )}
              </CardContent>
            </Card>

          </div>
        </AnimatedSection>
      </DashboardLayout>
    </div>
  )
}
