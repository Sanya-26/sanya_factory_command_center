// src/pages/_modules/qc-recovery/ComplianceQueue.tsx
// Compliance KB approval queue cockpit
// Ticket: recovery-e2e-auditor-61115444
// Closes: oq-c002-co-2 (counsel-approve wiring)
// All mutations via auditAndExecute — every button wired, no stubs.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DashboardHeader } from '@/components/layout/DashboardHeader'
import { AnimatedSection } from '@/components/ui/AnimatedSection'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AgentEmptyState } from '@/components/ui/AgentEmptyState'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { auditAndExecute } from '@/lib/auditAndExecute'
import {
  usePendingCompliance,
  useStubs,
  useApprovalLog,
  getAccessToken,
} from '@/lib/_modules/qc-recovery/useQCData'
import type { ComplianceKBItem, ApprovalLogEntry } from '@/lib/_modules/qc-recovery/types'
import { cn } from '@/lib/utils'

// ── Counsel action endpoint (per content-002-concierge-kb manifest) ───────────
const COUNSEL_APPROVE_URL = () =>
  `${import.meta.env.VITE_HARNESS_URL ?? ''}/functions/v1/content-002-concierge-kb__counsel-approve`

// ── Helpers ───────────────────────────────────────────────────────────────────
function frameworkBadgeVariant(framework: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (framework.toLowerCase().startsWith('fda')) return 'destructive'
  if (framework.toLowerCase().startsWith('ftc')) return 'secondary'
  return 'outline'
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

// ── Reject dialog ─────────────────────────────────────────────────────────────
function RejectDialog({
  item,
  open,
  onClose,
  onConfirm,
}: {
  item: ComplianceKBItem
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isValid = reason.trim().length >= 8 // PL/pgSQL guard: >=8 chars

  async function handleSubmit() {
    if (!isValid) return
    setSubmitting(true)
    try {
      await onConfirm(reason.trim())
      setReason('')
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject compliance item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{item.framework}</strong> · {item.claim_type}
          </p>
          <div className="space-y-1">
            <Label htmlFor="reject-reason" className="text-sm">
              Rejection reason <span className="text-muted-foreground">(min 8 chars)</span>
            </Label>
            <Textarea
              id="reject-reason"
              placeholder="Enter reason for rejection…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="resize-none"
              aria-describedby="reject-reason-hint"
            />
            <p
              id="reject-reason-hint"
              className={cn(
                'text-xs',
                isValid ? 'text-muted-foreground' : 'text-destructive'
              )}
            >
              {reason.trim().length} / 8 chars minimum
            </p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={!isValid || submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? 'Rejecting…' : 'Confirm rejection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Extend dialog ─────────────────────────────────────────────────────────────
function ExtendDialog({
  item,
  open,
  onClose,
  onConfirm,
}: {
  item: ComplianceKBItem
  open: boolean
  onClose: () => void
  onConfirm: (newExpiresAt: string, reason: string) => Promise<void>
}) {
  // 180d hard ceiling from created_at (per fn_counsel_extend_stub)
  const maxDate = new Date(new Date(item.created_at).getTime() + 180 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const [newDate, setNewDate] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isValid = !!newDate && reason.trim().length >= 8

  async function handleSubmit() {
    if (!isValid) return
    setSubmitting(true)
    try {
      await onConfirm(new Date(newDate).toISOString(), reason.trim())
      setNewDate('')
      setReason('')
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend stub expiry</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Hard ceiling: <strong className="text-foreground">{maxDate}</strong> (180d from creation)
          </p>
          <div className="space-y-1">
            <Label htmlFor="new-expires-at">New expiry date</Label>
            <Input
              id="new-expires-at"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              max={maxDate}
              min={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="extend-reason">
              Reason <span className="text-muted-foreground">(min 8 chars)</span>
            </Label>
            <Textarea
              id="extend-reason"
              placeholder="Reason for extension…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button disabled={!isValid || submitting} onClick={() => void handleSubmit()}>
            {submitting ? 'Extending…' : 'Extend stub'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Pending items table ───────────────────────────────────────────────────────
function PendingTable({
  items,
  onRefetch,
}: {
  items: ComplianceKBItem[]
  onRefetch: () => void
}) {
  const { toast } = useToast()
  const [rejectTarget, setRejectTarget] = useState<ComplianceKBItem | null>(null)
  const [extendTarget, setExtendTarget] = useState<ComplianceKBItem | null>(null)
  const [actioning, setActioning] = useState<string | null>(null)

  async function callCounselEndpoint(payload: object) {
    const token = await getAccessToken()
    const resp = await fetch(COUNSEL_APPROVE_URL(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token ?? ''}`,
      },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({})) as { message?: string }
      throw new Error(body.message ?? `HTTP ${resp.status}`)
    }
    return resp
  }

  async function handleApprove(item: ComplianceKBItem) {
    setActioning(item.id)
    try {
      await auditAndExecute(
        'compliance_kb.counsel_approve',
        { item_id: item.id, action: 'approve' },
        async (signedRequestId) => {
          return callCounselEndpoint({ action: 'approve', item_id: item.id, request_id: signedRequestId })
        }
      )
      toast({ title: 'Approved', description: `${item.framework} · ${item.claim_type}` })
      onRefetch()
    } catch (e) {
      toast({
        title: 'Approval failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setActioning(null)
    }
  }

  async function handleRejectConfirm(item: ComplianceKBItem, reason: string) {
    setActioning(item.id)
    try {
      await auditAndExecute(
        'compliance_kb.counsel_reject',
        { item_id: item.id, action: 'reject', reason },
        async (signedRequestId) => {
          return callCounselEndpoint({ action: 'reject', item_id: item.id, reason, request_id: signedRequestId })
        }
      )
      toast({ title: 'Rejected', description: `${item.framework} · ${item.claim_type}` })
      onRefetch()
    } catch (e) {
      toast({
        title: 'Rejection failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setActioning(null)
    }
  }

  async function handleExtendConfirm(item: ComplianceKBItem, newExpiresAt: string, reason: string) {
    setActioning(item.id)
    try {
      await auditAndExecute(
        'compliance_kb.counsel_extend_stub',
        { item_id: item.id, action: 'extend', new_expires_at: newExpiresAt, reason },
        async (signedRequestId) => {
          return callCounselEndpoint({
            action: 'extend',
            item_id: item.id,
            new_expires_at: newExpiresAt,
            reason,
            request_id: signedRequestId,
          })
        }
      )
      toast({ title: 'Stub extended', description: `New expiry: ${new Date(newExpiresAt).toLocaleDateString()}` })
      onRefetch()
    } catch (e) {
      toast({
        title: 'Extension failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setActioning(null)
    }
  }

  if (items.length === 0) {
    return (
      <AgentEmptyState
        agent="QC Recovery"
        title="No pending approvals"
        description="All compliance KB items have been reviewed. New items will appear here as they are submitted."
      />
    )
  }

  return (
    <>
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-36">
                Framework
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">
                Claim type
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Content
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">
                Added
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-48 text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className="hover:bg-muted/20">
                <TableCell>
                  <Badge variant={frameworkBadgeVariant(item.framework)} className="text-xs">
                    {item.framework}
                  </Badge>
                  {item.stub && (
                    <Badge variant="outline" className="text-xs ml-1">
                      stub
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-foreground">{item.claim_type}</TableCell>
                <TableCell
                  className="text-sm text-muted-foreground max-w-xs truncate"
                  title={item.content}
                >
                  {item.content}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {relativeDate(item.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="default"
                      className="text-xs h-7"
                      disabled={actioning === item.id}
                      onClick={() => void handleApprove(item)}
                      aria-label={`Approve ${item.framework} ${item.claim_type}`}
                    >
                      {actioning === item.id ? '…' : 'Approve'}
                    </Button>
                    {item.stub && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="text-xs h-7"
                        disabled={actioning === item.id}
                        onClick={() => setExtendTarget(item)}
                        aria-label={`Extend stub for ${item.framework}`}
                      >
                        Extend
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={actioning === item.id}
                      onClick={() => setRejectTarget(item)}
                      aria-label={`Reject ${item.framework} ${item.claim_type}`}
                    >
                      Reject
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Reject dialog */}
      {rejectTarget && (
        <RejectDialog
          item={rejectTarget}
          open={!!rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={(reason) => handleRejectConfirm(rejectTarget, reason)}
        />
      )}

      {/* Extend dialog */}
      {extendTarget && (
        <ExtendDialog
          item={extendTarget}
          open={!!extendTarget}
          onClose={() => setExtendTarget(null)}
          onConfirm={(newDate, reason) => handleExtendConfirm(extendTarget, newDate, reason)}
        />
      )}
    </>
  )
}

// ── Stubs panel ───────────────────────────────────────────────────────────────
function StubsPanel({
  expiring,
  expired,
  loading,
}: {
  expiring: ComplianceKBItem[]
  expired: ComplianceKBItem[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Expiring within 7d */}
      {expiring.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-accent uppercase tracking-widest mb-2">
            ⚠ Expiring soon ({expiring.length})
          </p>
          <div className="space-y-1">
            {expiring.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-md bg-accent/5 border border-accent/20"
              >
                <span className="text-sm text-foreground font-medium">
                  {item.framework} · {item.claim_type}
                </span>
                <span className="text-xs text-muted-foreground">
                  expires {item.expires_at ? new Date(item.expires_at).toLocaleDateString() : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expired */}
      {expired.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-destructive uppercase tracking-widest mb-2">
            ✕ Expired ({expired.length}) — no longer in RAG
          </p>
          <div className="space-y-1">
            {expired.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-md bg-destructive/5 border border-destructive/20"
              >
                <span className="text-sm text-foreground font-medium">
                  {item.framework} · {item.claim_type}
                </span>
                <span className="text-xs text-muted-foreground">
                  expired {item.expires_at ? relativeDate(item.expires_at) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {expiring.length === 0 && expired.length === 0 && (
        <AgentEmptyState
          agent="QC Recovery"
          title="No stubs expiring"
          description="All compliance stubs are within their validity window."
        />
      )}
    </div>
  )
}

// ── Approval log table ────────────────────────────────────────────────────────
function ApprovalLogTable({
  log,
  loading,
}: {
  log: ApprovalLogEntry[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (log.length === 0) {
    return (
      <AgentEmptyState
        agent="QC Recovery"
        title="No decisions yet"
        description="Counsel approval decisions will appear here."
      />
    )
  }

  const decisionVariant = (d: string): 'default' | 'destructive' | 'outline' | 'secondary' => {
    if (d === 'approved') return 'default'
    if (d === 'rejected') return 'destructive'
    if (d === 'withdrawn') return 'outline'
    return 'secondary'
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Framework</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Claim</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Decision</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">When</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {log.map((entry) => (
            <TableRow key={entry.id} className="hover:bg-muted/20">
              <TableCell>
                <Badge variant={frameworkBadgeVariant(entry.framework)} className="text-xs">
                  {entry.framework}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-foreground">{entry.claim_type}</TableCell>
              <TableCell>
                <Badge variant={decisionVariant(entry.decision)} className="text-xs capitalize">
                  {entry.decision}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {relativeDate(entry.decided_at)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={entry.reason}>
                {entry.reason ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ComplianceQueue() {
  const navigate = useNavigate()
  const { items: pending, loading: pendingLoading, error: pendingError, refetch: refetchPending } = usePendingCompliance()
  const { expiring, expired, loading: stubsLoading, error: stubsError } = useStubs()
  const { log, loading: logLoading, error: logError } = useApprovalLog()

  const totalExpiring = expiring.length + expired.length

  return (
    <div data-module="qc-recovery" style={{ display: 'contents' }}>
      <DashboardLayout>
        <DashboardHeader
          title="Compliance KB"
          subtitle="Counsel review queue — approve, reject, or extend compliance knowledge base items."
          actions={
            <Button
              variant="ghost"
              onClick={() => navigate('/modules/qc-recovery')}
            >
              ← Back to QC overview
            </Button>
          }
        />

        <AnimatedSection className="mt-6">
          {(pendingError || stubsError || logError) && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                Could not load compliance data:{' '}
                {(pendingError ?? stubsError ?? logError)?.message ?? 'Unknown error.'}
              </AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="pending">
            <TabsList className="mb-5">
              <TabsTrigger value="pending">
                Pending
                {!pendingLoading && pending.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-xs">
                    {pending.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="stubs">
                Stubs
                {!stubsLoading && totalExpiring > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-xs">
                    {totalExpiring}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="log">History</TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              <Card className="bg-card border-border">
                <CardHeader className="pb-3 border-b border-border">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">
                      Awaiting counsel decision
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => refetchPending()}
                    >
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  {pendingLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-md" />
                      ))}
                    </div>
                  ) : (
                    <PendingTable items={pending} onRefetch={refetchPending} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="stubs">
              <Card className="bg-card border-border">
                <CardHeader className="pb-3 border-b border-border">
                  <CardTitle className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">
                    Stub expiry watchdog
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <StubsPanel expiring={expiring} expired={expired} loading={stubsLoading} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="log">
              <Card className="bg-card border-border">
                <CardHeader className="pb-3 border-b border-border">
                  <CardTitle className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">
                    Last 90 days — counsel decisions
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <ApprovalLogTable log={log} loading={logLoading} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </AnimatedSection>
      </DashboardLayout>
    </div>
  )
}
