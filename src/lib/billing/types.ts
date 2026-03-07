import type { ApiType, UsageUnit } from './cost'
import type { TaskBillingInfo } from '@/lib/task/types'

export type BillingMode = 'OFF' | 'SHADOW' | 'ENFORCE'

export type BillingStatus =
  | 'skipped'
  | 'quoted'
  | 'frozen'
  | 'settled'
  | 'rolled_back'
  | 'failed'

export interface BillingRecordParams {
  projectId: string
  action: string
  billingKey?: string
  requestId?: string
  metadata?: Record<string, unknown>
}

export type AnyTaskBillingInfo = TaskBillingInfo | { billable: false; source?: 'task' }

export interface BillingQuote {
  cost: number
  apiType: ApiType
  model: string
  quantity: number
  unit: UsageUnit
}

export type { TaskBillingInfo, TaskType } from '@/lib/task/types'
