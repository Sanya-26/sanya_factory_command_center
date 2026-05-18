// src/pages/_modules/qc-recovery/routes.ts
// QC Recovery module — route declarations consumed by App.tsx
// Ticket: recovery-e2e-auditor-61115444
//
// App.tsx imports moduleRoutes and registers each path with React.lazy +
// Suspense under a RequireCustomer guard.

import { lazy } from 'react'

export const QCRecoveryDashboard = lazy(() => import('./index'))
export const ComplianceQueue = lazy(() => import('./ComplianceQueue'))
export const IntegrationHealth = lazy(() => import('./IntegrationHealth'))
export const AuditFindings = lazy(() => import('./AuditFindings'))

export const qcRecoveryPaths = {
  root: '/modules/qc-recovery',
  compliance: '/modules/qc-recovery/compliance',
  integrations: '/modules/qc-recovery/integrations',
  audit: '/modules/qc-recovery/audit',
  auditRun: '/modules/qc-recovery/audit/:runId',
} as const
