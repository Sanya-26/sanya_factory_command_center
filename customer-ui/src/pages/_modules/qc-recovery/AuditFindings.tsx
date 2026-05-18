// src/pages/_modules/qc-recovery/AuditFindings.tsx
// E2E audit findings browser — list of runs + finding detail
// Ticket: recovery-e2e-auditor-61115444

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DashboardHeader } from '@/components/layout/DashboardHeader'
import { AnimatedSection } from '@/components/ui/AnimatedSection'
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
import {
  useRecentAuditRuns,
  useAuditRunDetail,
} from '@/lib/_modules/qc-recovery/useQCData'
import type {
  E2EAuditRun,
  AuditFinding,
  AuditFindingSeverity,
} from '@/lib/_modules/qc-recovery/types'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────
function verdictVariant(v: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (v === 'approved') return 'default'
  if (v === 'ship-with-flag') return 'secondary'
  if (v === 'blocked') return 'destructive'
  return 'outline'
}

function severityVariant(s: AuditFindingSeverity): 'destructive' | 'secondary' | 'outline' {
  if (s === 'critical') return 'destructive'
  if (s === 'important') return 'secondary'
  return 'outline'
}

function durationLabel(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ── Run list row ──────────────────────────────────────────────────────────────
function RunListRow({
  run,
  selected,
  onClick,
}: {
  run: E2EAuditRun
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-between w-full px-4 py-3 rounded-md text-left transition-colors cursor-pointer',
        selected
          ? 'bg-primary/10 border border-primary/30'
          : 'hover:bg-muted/30 border border-transparent'
      )}
      aria-pressed={selected}
      aria-label={`Audit run ${new Date(run.created_at).toLocaleString()}: ${run.verdict}`}
    >
      <div className="space-y-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant={verdictVariant(run.verdict)} className="text-xs capitalize shrink-0">
            {run.verdict}
          </Badge>
          <span className="text-xs text-muted-foreground truncate">
            {run.tenant_slug ?? run.build_run_id?.slice(0, 8) ?? '—'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {new Date(run.created_at).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-3">
        {run.critical_count > 0 && (
          <span className="text-xs text-destructive font-semibold tabular-nums">
            {run.critical_count} crit
          </span>
        )}
        <span className="text-xs text-muted-foreground tabular-nums">
          {run.findings_count} findings
        </span>
      </div>
    </button>
  )
}

// ── Finding row ───────────────────────────────────────────────────────────────
function FindingRow({ finding }: { finding: AuditFinding }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <TableRow
      className={cn(
        'hover:bg-muted/20 cursor-pointer',
        finding.severity === 'critical' && 'bg-destructive/5'
      )}
      onClick={() => setExpanded((e) => !e)}
    >
      <TableCell>
        <Badge variant={severityVariant(finding.severity)} className="text-xs capitalize">
          {finding.severity}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-foreground font-mono">{finding.route}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{finding.viewport}</TableCell>
      <TableCell className="text-xs text-foreground">
        <span className="line-clamp-2">{finding.issue}</span>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 space-y-1 overflow-hidden"
            >
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Selector:</strong>{' '}
                {finding.selector ?? '—'}
              </p>
              <p className="text-xs text-primary">
                <strong>Fix:</strong> {finding.suggested_fix}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground capitalize">{finding.category?.replace(/-/g, ' ')}</TableCell>
    </TableRow>
  )
}

// ── Run detail panel ──────────────────────────────────────────────────────────
function RunDetail({ runId }: { runId: string }) {
  const { run, loading, error } = useAuditRunDetail(runId)
  const [severityFilter, setSeverityFilter] = useState<AuditFindingSeverity | 'all'>('all')

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-48 rounded" />
        <Skeleton className="h-48 w-full rounded" />
      </div>
    )
  }

  if (error || !run) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertDescription>
          {error?.message ?? 'Audit run not found.'}
        </AlertDescription>
      </Alert>
    )
  }

  const allFindings: AuditFinding[] = Array.isArray(run.findings) ? run.findings : []
  const filtered =
    severityFilter === 'all'
      ? allFindings
      : allFindings.filter((f) => f.severity === severityFilter)

  const criticalCount = allFindings.filter((f) => f.severity === 'critical').length
  const importantCount = allFindings.filter((f) => f.severity === 'important').length
  const advisoryCount = allFindings.filter((f) => f.severity === 'advisory').length

  return (
    <div className="space-y-5">
      {/* Run meta */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Badge variant={verdictVariant(run.verdict)} className="capitalize">
                {run.verdict}
              </Badge>
              <Badge
                variant={run.status === 'passed' ? 'default' : run.status === 'failed' ? 'destructive' : 'secondary'}
                className="capitalize"
              >
                {run.status}
              </Badge>
            </div>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-lg font-semibold text-foreground tabular-nums">{run.routes_count}</div>
                <div className="text-xs text-muted-foreground">routes</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-destructive tabular-nums">{run.critical_count}</div>
                <div className="text-xs text-muted-foreground">critical</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-foreground tabular-nums">{run.findings_count}</div>
                <div className="text-xs text-muted-foreground">total findings</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{durationLabel(run.duration_ms)}</div>
                <div className="text-xs text-muted-foreground">duration</div>
              </div>
            </div>
          </div>
          {run.audit_url && (
            <p className="text-xs text-muted-foreground mt-2 font-mono">{run.audit_url}</p>
          )}
        </CardContent>
      </Card>

      {/* Findings table */}
      {allFindings.length === 0 ? (
        <AgentEmptyState
          agent="QC Recovery"
          title="No findings recorded"
          description="This audit run completed with no findings stored, or findings data is not available in this record."
        />
      ) : (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">
                Findings ({allFindings.length})
              </CardTitle>
              <div className="flex gap-1.5">
                {(['all', 'critical', 'important', 'advisory'] as const).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={severityFilter === s ? 'default' : 'ghost'}
                    className="text-xs h-6 px-2"
                    onClick={() => setSeverityFilter(s)}
                  >
                    {s === 'all' ? `All (${allFindings.length})`
                      : s === 'critical' ? `Critical (${criticalCount})`
                      : s === 'important' ? `Important (${importantCount})`
                      : `Advisory (${advisoryCount})`}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 p-0">
            <div className="rounded-b-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Severity</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Route</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Viewport</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Issue</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((finding, i) => (
                    <FindingRow key={i} finding={finding} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Console errors */}
      {Array.isArray(run.console_errors) && run.console_errors.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">
              Console errors ({run.console_errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-1.5">
            {run.console_errors.map((ce, i) => (
              <div key={i} className="text-xs font-mono bg-destructive/5 px-3 py-2 rounded-md">
                <span className="text-muted-foreground mr-2">[{ce.route}]</span>
                <span className="text-destructive">{ce.message}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Network errors */}
      {Array.isArray(run.network_errors) && run.network_errors.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">
              Network errors ({run.network_errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16">Status</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20">Method</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">URL</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Route</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {run.network_errors.map((ne, i) => (
                    <TableRow key={i} className="hover:bg-muted/20">
                      <TableCell>
                        <Badge variant="destructive" className="text-xs tabular-nums">{ne.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-foreground">{ne.method}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground truncate max-w-xs" title={ne.url}>
                        {ne.url}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ne.route}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function AuditFindings() {
  const navigate = useNavigate()
  const { runId: paramRunId } = useParams<{ runId?: string }>()
  const { runs, loading: runsLoading, error: runsError } = useRecentAuditRuns()
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(paramRunId)

  const activeRunId = selectedRunId ?? runs[0]?.id

  return (
    <div data-module="qc-recovery" style={{ display: 'contents' }}>
      <DashboardLayout>
        <DashboardHeader
          title="E2E audit findings"
          subtitle="Playwright real-browser audit results — findings, console errors, network errors."
          actions={
            <Button variant="ghost" onClick={() => navigate('/modules/qc-recovery')}>
              ← Overview
            </Button>
          }
        />

        <AnimatedSection className="mt-6">
          {runsError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>Failed to load audit runs: {runsError.message}</AlertDescription>
            </Alert>
          )}

          {runsLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-md" />
                ))}
              </div>
              <div className="lg:col-span-3 space-y-3">
                <Skeleton className="h-24 w-full rounded-md" />
                <Skeleton className="h-64 w-full rounded-md" />
              </div>
            </div>
          ) : runs.length === 0 ? (
            <AgentEmptyState
              agent="QC Recovery"
              title="No audit runs yet"
              description="E2E audit results will appear here after the first Playwright pass is triggered against the staging URL."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
              {/* Run list sidebar */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground tracking-widest uppercase mb-3 px-1">
                  Runs ({runs.length})
                </p>
                {runs.map((run) => (
                  <RunListRow
                    key={run.id}
                    run={run}
                    selected={activeRunId === run.id}
                    onClick={() => {
                      setSelectedRunId(run.id)
                      navigate(`/modules/qc-recovery/audit/${run.id}`, { replace: true })
                    }}
                  />
                ))}
              </div>

              {/* Detail pane */}
              <div className="lg:col-span-3">
                {activeRunId ? (
                  <RunDetail runId={activeRunId} />
                ) : (
                  <AgentEmptyState
                    agent="QC Recovery"
                    title="Select a run"
                    description="Choose an audit run from the list to view its findings."
                  />
                )}
              </div>
            </div>
          )}
        </AnimatedSection>
      </DashboardLayout>
    </div>
  )
}
