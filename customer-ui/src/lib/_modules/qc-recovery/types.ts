// src/lib/_modules/qc-recovery/types.ts
// QC Recovery module — TypeScript type definitions
// Ticket: recovery-e2e-auditor-61115444

export type AuditFindingSeverity = 'critical' | 'important' | 'advisory'

export type AuditFindingCategory =
  | 'broken-button'
  | 'console-error'
  | 'network-error'
  | 'dead-link'
  | 'layout-glitch'
  | 'branding-drift'
  | 'a11y-trap'
  | 'interaction-stuck'

export interface AuditFinding {
  severity: AuditFindingSeverity
  category: AuditFindingCategory
  route: string
  viewport: string
  selector?: string
  issue: string
  suggested_fix: string
  screenshot_path?: string
}

export interface ConsoleError {
  route: string
  level: string
  message: string
  stack?: string
}

export interface NetworkError {
  route: string
  status: number
  url: string
  method: string
}

export interface E2EAuditRun {
  id: string
  company_id: string
  build_run_id: string
  tenant_slug: string
  audit_url: string
  status: 'passed' | 'failed' | 'timeout'
  verdict: 'approved' | 'ship-with-flag' | 'blocked'
  routes_count: number
  findings_count: number
  critical_count: number
  cost_usd: number
  duration_ms: number
  findings: AuditFinding[]
  console_errors: ConsoleError[]
  network_errors: NetworkError[]
  created_at: string
}

export type ComplianceKBStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export interface ComplianceKBItem {
  id: string
  framework: string
  claim_type: string
  content: string
  status: ComplianceKBStatus
  stub: boolean
  expires_at?: string
  created_at: string
  updated_at: string
  approved_by?: string
  approved_at?: string
  rejected_at?: string
  rejection_reason?: string
  withdrawn_at?: string
  withdrawal_reason?: string
}

export interface ApprovalLogEntry {
  id: string
  framework: string
  claim_type: string
  decision: 'approved' | 'rejected' | 'withdrawn' | 'extended_stub'
  decided_by: string
  decided_at: string
  reason?: string
}

export type IntegrationConnectionStatus = 'connected' | 'expired' | 'error' | 'disconnected'

export interface IntegrationStatus {
  id: string
  vendor: string
  label: string
  status: IntegrationConnectionStatus
  last_refreshed_at?: string
  error_message?: string
}

export type ModuleHealthStatus = 'operational' | 'degraded' | 'down' | 'unknown'

export interface ModuleHealth {
  module: string
  label: string
  status: ModuleHealthStatus
  last_checked?: string
  detail?: string
}

export interface QCSummaryMetrics {
  open_critical_findings: number
  pending_compliance_approvals: number
  expiring_stubs_7d: number
  integration_errors: number
  audit_runs_today: number
}

export type CounselAction = 'approve' | 'reject' | 'extend' | 'withdraw'

export interface CounselActionPayload {
  item_id: string
  action: CounselAction
  reason?: string          // reject: ≥8 chars; withdraw: required
  new_expires_at?: string  // extend: ISO date string
}
