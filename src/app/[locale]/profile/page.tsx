'use client'
import { logError as _ulogError } from '@/lib/logging/core'

import { useCallback, useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import ApiConfigTab from './components/ApiConfigTab'
import { AppIcon, iconRegistry, type LucideIcon } from '@/components/ui/icons'

interface BalanceInfo {
  currency?: string
  balance: number
  frozenAmount: number
  totalSpent: number
}

interface Transaction {
  id: string
  type: 'recharge' | 'consume'
  amount: number
  balanceAfter: number
  description: string | null
  action: string | null
  projectName: string | null
  episodeNumber: number | null
  episodeName: string | null
  billingMeta: {
    quantity?: number
    unit?: string
    model?: string
    apiType?: string
    resolution?: string
    duration?: number
    inputTokens?: number
    outputTokens?: number
    actualModels?: string[]
  } | null
  createdAt: string
}

interface TransactionPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface ProjectCost {
  currency?: string
  projectId: string
  projectName: string
  totalCost: number
  recordCount: number
}

interface CostByType {
  apiType: string
  _sum: { cost: number | null }
  _count: number
}

interface CostByAction {
  action: string
  _sum: { cost: number | null }
  _count: number
}

interface CostRecord {
  id: string
  apiType: string
  model: string
  action: string
  quantity: number
  unit: string
  cost: number
  createdAt: string
}

interface ProjectDetails {
  currency?: string
  total: number
  byType: CostByType[]
  byAction: CostByAction[]
  recentRecords: CostRecord[]
}

// 类型对应的颜色
const TYPE_COLORS: Record<string, { bg: string, text: string, border: string }> = {
  image: { bg: 'bg-[var(--glass-bg-muted)]', text: 'text-[var(--glass-text-secondary)]', border: 'border-[var(--glass-stroke-base)]' },
  video: { bg: 'bg-[var(--glass-bg-muted)]', text: 'text-[var(--glass-text-secondary)]', border: 'border-[var(--glass-stroke-base)]' },
  text: { bg: 'bg-[var(--glass-bg-muted)]', text: 'text-[var(--glass-text-secondary)]', border: 'border-[var(--glass-stroke-base)]' },
  tts: { bg: 'bg-[var(--glass-bg-muted)]', text: 'text-[var(--glass-text-secondary)]', border: 'border-[var(--glass-stroke-base)]' },
  voice: { bg: 'bg-[var(--glass-bg-muted)]', text: 'text-[var(--glass-text-secondary)]', border: 'border-[var(--glass-stroke-base)]' },
  voice_design: { bg: 'bg-[var(--glass-bg-muted)]', text: 'text-[var(--glass-text-secondary)]', border: 'border-[var(--glass-stroke-base)]' },
  lip_sync: { bg: 'bg-[var(--glass-bg-muted)]', text: 'text-[var(--glass-text-secondary)]', border: 'border-[var(--glass-stroke-base)]' },
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getCurrencySymbol(currency: string): string {
  const normalized = currency.toUpperCase()
  if (normalized === 'USD') return '$'
  if (normalized === 'EUR') return 'EUR '
  if (normalized === 'GBP') return 'GBP '
  return '¥'
}

function formatMoney(amount: number, currency: string, digits = 2): string {
  return `${getCurrencySymbol(currency)}${amount.toFixed(digits)}`
}

// 交易流水图标映射（简洁黑白风格）- 使用统一 iconRegistry
const TX_ICON_MAP: Record<string, LucideIcon> = {
  image: iconRegistry.image,
  video: iconRegistry.clapperboard,
  text: iconRegistry.brain,
  voice: iconRegistry.mic,
  tts: iconRegistry.mic,
  'voice-design': iconRegistry.audioWave,
  'lip-sync': iconRegistry.sparkles,
}

function getTxIcon(tx: Transaction): LucideIcon {
  if (tx.type === 'recharge') return iconRegistry.arrowDownCircle
  const apiType = tx.billingMeta?.apiType as string | undefined
  if (apiType && TX_ICON_MAP[apiType]) return TX_ICON_MAP[apiType]
  return iconRegistry.bolt
}

/** 根据 billingMeta 的 unit 字段生成人类可读的用量描述 */
function formatBillingDetail(
  meta: Transaction['billingMeta'],
  translate: (key: string, values?: Record<string, unknown>) => string,
): string | null {
  if (!meta || !meta.unit) return null
  const q = meta.quantity ?? 0
  switch (meta.unit) {
    case 'image':
      return meta.resolution
        ? translate('billingDetail.imageWithRes', { count: q, resolution: meta.resolution })
        : translate('billingDetail.image', { count: q })
    case 'video':
      return meta.resolution
        ? translate('billingDetail.videoWithRes', { count: q, resolution: meta.resolution })
        : translate('billingDetail.video', { count: q })
    case 'token': {
      const inT = meta.inputTokens ?? 0
      const outT = meta.outputTokens ?? 0
      if (inT > 0 || outT > 0) return translate('billingDetail.tokens', { count: (inT + outT).toLocaleString() })
      return q > 0 ? translate('billingDetail.tokens', { count: q.toLocaleString() }) : null
    }
    case 'second':
      return translate('billingDetail.seconds', { count: q })
    case 'call':
      return translate('billingDetail.calls', { count: q })
    default:
      return q > 0 ? `${q} ${meta.unit}` : null
  }
}

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('profile')
  const tc = useTranslations('common')
  const tb = useTranslations('billing')
  const [balance, setBalance] = useState<BalanceInfo | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [transactionPagination, setTransactionPagination] = useState<TransactionPagination | null>(null)
  const [projects, setProjects] = useState<ProjectCost[]>([])
  const [currency, setCurrency] = useState('CNY')
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailsLoading, setDetailsLoading] = useState(false)

  // 主要分区：扣费记录 / API配置
  const [activeSection, setActiveSection] = useState<'billing' | 'apiConfig'>('apiConfig')
  // 扣费记录内的子视图
  const [billingView, setBillingView] = useState<'transactions' | 'projects'>('transactions')
  const [projectViewMode, setProjectViewMode] = useState<'summary' | 'records'>('summary')
  const [recordsFilter, setRecordsFilter] = useState<string>('all')

  // 账户流水筛选和分页状态
  const [txPage, setTxPage] = useState(1)
  const [txType, setTxType] = useState<'all' | 'recharge' | 'consume'>('all')
  const [txStartDate, setTxStartDate] = useState<string>('')
  const [txEndDate, setTxEndDate] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)

  const fetchTransactions = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: txPage.toString(),
        pageSize: '20',
      })
      if (txType !== 'all') params.append('type', txType)
      if (txStartDate) params.append('startDate', txStartDate)
      if (txEndDate) params.append('endDate', txEndDate)

      const res = await fetch(`/api/user/transactions?${params}`)
      if (res.ok) {
        const data = await res.json()
        if (typeof data.currency === 'string' && data.currency) setCurrency(data.currency)
        setTransactions(data.transactions || [])
        setTransactionPagination(data.pagination || null)
      }
    } catch (error) {
      _ulogError('获取交易记录失败:', error)
    }
  }, [txEndDate, txPage, txStartDate, txType])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [balanceRes, costsRes] = await Promise.all([
        fetch('/api/user/balance'),
        fetch('/api/user/costs')
      ])
      if (balanceRes.ok) {
        const payload = await balanceRes.json()
        if (typeof payload.currency === 'string' && payload.currency) setCurrency(payload.currency)
        setBalance({
          balance: Number(payload.balance || 0),
          frozenAmount: Number(payload.frozenAmount || 0),
          totalSpent: Number(payload.totalSpent || 0),
          currency: typeof payload.currency === 'string' ? payload.currency : undefined,
        })
      }
      if (costsRes.ok) {
        const data = await costsRes.json()
        if (typeof data.currency === 'string' && data.currency) setCurrency(data.currency)
        setProjects(data.byProject || [])
      }
      await fetchTransactions()
    } catch (error) {
      _ulogError('获取数据失败:', error)
    } finally {
      setLoading(false)
    }
  }, [fetchTransactions])

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.push('/auth/signin'); return }
    void fetchData()
  }, [fetchData, router, session, status])

  useEffect(() => {
    if (session) {
      void fetchTransactions()
    }
  }, [fetchTransactions, session])

  useEffect(() => {
    if (selectedProject && selectedProject !== 'all') {
      void fetchProjectDetails(selectedProject)
      setProjectViewMode('summary')
      setRecordsFilter('all')
    }
  }, [selectedProject])

  async function fetchProjectDetails(projectId: string) {
    setDetailsLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/costs`)
      if (res.ok) {
        const data = await res.json()
        if (typeof data.currency === 'string' && data.currency) setCurrency(data.currency)
        setProjectDetails({
          total: data.total || 0,
          byType: data.byType || [],
          byAction: data.byAction || [],
          recentRecords: data.recentRecords || [],
          currency: data.currency,
        })
      }
    } catch (error) {
      _ulogError('获取项目费用失败:', error)
    } finally {
      setDetailsLoading(false)
    }
  }

  if (status === 'loading' || !session) {
    return (
      <div className="glass-page flex min-h-screen items-center justify-center">
        <div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div>
      </div>
    )
  }

  const selectedProjectName = projects.find(p => p.projectId === selectedProject)?.projectName
  const filteredRecords = projectDetails?.recentRecords?.filter(r =>
    recordsFilter === 'all' ? true : r.apiType === recordsFilter
  ) || []
  const availableTypes = [...new Set(projectDetails?.recentRecords?.map(r => r.apiType) || [])]

  return (
    <div className="glass-page min-h-screen">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-6 h-[calc(100vh-140px)]">

          {/* 左侧侧边栏 */}
          <div className="w-64 flex-shrink-0">
            <div className="glass-surface-elevated h-full flex flex-col p-5">

              {/* 用户信息 */}
              <div className="mb-6">
                <div className="mb-4">
                  <h2 className="font-semibold text-[var(--glass-text-primary)]">{session.user?.name || t('user')}</h2>
                  <p className="text-xs text-[var(--glass-text-tertiary)]">{t('personalAccount')}</p>
                </div>

                {/* 余额卡片 */}
                <div className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-base)] p-4">
                  <div className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('availableBalance')}</div>
                  <div className="mt-1 text-2xl font-bold text-[var(--glass-text-primary)]">{formatMoney(balance?.balance || 0, currency)}</div>
                  <div className="flex gap-4 mt-3 text-xs">
                    <div>
                      <span className="text-[var(--glass-text-secondary)]">{t('frozen')}</span>
                      <span className="ml-1 font-medium text-[var(--glass-text-primary)]">{formatMoney(balance?.frozenAmount || 0, currency)}</span>
                    </div>
                    <div>
                      <span className="text-[var(--glass-text-secondary)]">{t('totalSpent')}</span>
                      <span className="ml-1 font-medium text-[var(--glass-text-primary)]">{formatMoney(balance?.totalSpent || 0, currency)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 导航菜单 */}
              <nav className="flex-1 space-y-2">
                <button
                  onClick={() => setActiveSection('apiConfig')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer ${activeSection === 'apiConfig'
                    ? 'glass-btn-base glass-btn-tone-info'
                    : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]'
                    }`}
                >
                  <AppIcon name="settingsHexAlt" className="w-5 h-5" />
                  <span className="font-medium">{t('apiConfig')}</span>
                </button>

                <button
                  onClick={() => setActiveSection('billing')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer ${activeSection === 'billing'
                    ? 'glass-btn-base glass-btn-tone-info'
                    : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]'
                    }`}
                >
                  <AppIcon name="receipt" className="w-5 h-5" />
                  <span className="font-medium">{t('billingRecords')}</span>
                </button>
              </nav>

              {/* 退出登录 */}
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="glass-btn-base glass-btn-tone-danger mt-auto flex items-center gap-2 px-4 py-3 text-sm rounded-xl transition-all cursor-pointer"
              >
                <AppIcon name="logout" className="w-4 h-4" />
                {t('logout')}
              </button>
            </div>
          </div>

          {/* 右侧内容区 */}
          <div className="flex-1 min-w-0">
            <div className="glass-surface-elevated h-full flex flex-col">

              {activeSection === 'apiConfig' ? (
                <ApiConfigTab />
              ) : (
                <>
                  {/* 扣费记录标题栏 */}
                  <div className="px-6 py-4 border-b border-[var(--glass-stroke-base)] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* 返回按钮 */}
                      {selectedProject !== 'all' && (
                        <button onClick={() => setSelectedProject('all')} className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] flex items-center gap-1 cursor-pointer">
                          <AppIcon name="chevronLeft" className="w-4 h-4" />
                          {tc('back')}
                        </button>
                      )}

                      {/* 视图切换 */}
                      {(() => {
                        const tabs = ['transactions', 'projects'] as const
                        const activeTab = (billingView === 'transactions' && selectedProject === 'all') ? 'transactions' : 'projects'
                        const activeIdx = tabs.indexOf(activeTab)
                        return (
                          <div className="rounded-lg p-0.5" style={{ background: 'rgba(0,0,0,0.04)' }}>
                            <div className="relative grid gap-1" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                              <div
                                className="absolute bottom-0.5 top-0.5 rounded-md bg-white transition-transform duration-200"
                                style={{
                                  boxShadow: '0 1px 4px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.06)',
                                  width: 'calc(100% / 2)',
                                  transform: `translateX(${activeIdx * 100}%)`,
                                }}
                              />
                              <button
                                onClick={() => { setBillingView('transactions'); setSelectedProject('all') }}
                                className={`relative z-[1] flex items-center justify-center gap-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === 'transactions' ? 'text-[var(--glass-text-primary)]' : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'}`}
                              >
                                {t('accountTransactions')}
                              </button>
                              <button
                                onClick={() => { setBillingView('projects'); setSelectedProject('all') }}
                                className={`relative z-[1] flex items-center justify-center gap-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === 'projects' ? 'text-[var(--glass-text-primary)]' : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'}`}
                              >
                                {t('projectDetails')}
                              </button>
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                    {/* 项目内视图切换 */}
                    {selectedProject !== 'all' && (
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg p-0.5" style={{ background: 'rgba(0,0,0,0.04)' }}>
                          {(() => {
                            const modeTabs = ['summary', 'records'] as const
                            const modeIdx = modeTabs.indexOf(projectViewMode)
                            return (
                              <div className="relative grid gap-1" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                                <div
                                  className="absolute bottom-0.5 top-0.5 rounded-md bg-white transition-transform duration-200"
                                  style={{
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.06)',
                                    width: 'calc(100% / 2)',
                                    transform: `translateX(${modeIdx * 100}%)`,
                                  }}
                                />
                                <button onClick={() => setProjectViewMode('summary')} className={`relative z-[1] px-3 py-1 text-xs rounded-md transition-colors cursor-pointer ${projectViewMode === 'summary' ? 'text-[var(--glass-text-primary)] font-medium' : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'}`}>
                                  {t('summary')}
                                </button>
                                <button onClick={() => setProjectViewMode('records')} className={`relative z-[1] px-3 py-1 text-xs rounded-md transition-colors cursor-pointer ${projectViewMode === 'records' ? 'text-[var(--glass-text-primary)] font-medium' : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'}`}>
                                  {t('transactions')}
                                </button>
                              </div>
                            )
                          })()}
                        </div>
                        {projectViewMode === 'records' && (
                          <select
                            value={recordsFilter}
                            onChange={(e) => setRecordsFilter(e.target.value)}
                            className="glass-select-base px-2 py-1 text-xs cursor-pointer"
                          >
                            <option value="all">{t('allTypes')}</option>
                            {availableTypes.map(type => (
                              <option key={type} value={type}>{t(`apiTypes.${type}`) || type}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 内容区域 */}
                  <div className="flex-1 overflow-y-auto p-5">
                    {loading ? (
                      <div className="space-y-3">{[1, 2, 3, 4, 5].map(i => <div key={i} className="glass-surface-soft h-16 rounded-xl animate-pulse"></div>)}</div>
                    ) : billingView === 'transactions' && selectedProject === 'all' ? (
                      /* 账户流水 */
                      <div className="h-full flex flex-col">
                        {/* 筛选按钮 */}
                        <div className="mb-3 flex items-center justify-between">
                          <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`px-4 py-2 text-sm rounded-xl border transition-all cursor-pointer flex items-center gap-2 ${showFilters
                              ? 'glass-btn-base glass-btn-secondary'
                              : (txType !== 'all' || txStartDate || txEndDate)
                                ? 'glass-btn-base glass-btn-secondary'
                                : 'glass-btn-base glass-btn-secondary'
                              }`}
                          >
                            <AppIcon name="filter" className="w-4 h-4" />
                            {t('filter')}
                            {(txType !== 'all' || txStartDate || txEndDate) && !showFilters && (
                              <span className="glass-chip glass-chip-neutral ml-1 px-2 py-0.5 text-xs">
                                {[txType !== 'all', txStartDate, txEndDate].filter(Boolean).length}
                              </span>
                            )}
                          </button>
                        </div>

                        {/* 筛选栏 */}
                        {showFilters && (
                          <div className="glass-surface-soft mb-4 space-y-3 rounded-2xl p-4">
                            <div className="flex items-end gap-3">
                              <div className="flex-1">
                                <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-secondary)]">{tb('transactionType')}</label>
                                <select
                                  value={txType}
                                  onChange={(e) => { setTxType(e.target.value as 'all' | 'recharge' | 'consume'); setTxPage(1) }}
                                  className="glass-select-base w-full cursor-pointer px-3 py-2.5 text-sm"
                                >
                                  <option value="all">{tb('all')}</option>
                                  <option value="recharge">{tb('income')}</option>
                                  <option value="consume">{tb('expense')}</option>
                                </select>
                              </div>
                              <div className="flex-1">
                                <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-secondary)]">{tb('startDate')}</label>
                                <input
                                  type="date"
                                  value={txStartDate}
                                  onChange={(e) => { setTxStartDate(e.target.value); setTxPage(1) }}
                                  className="glass-input-base w-full cursor-pointer px-3 py-2.5 text-sm"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-secondary)]">{tb('endDate')}</label>
                                <input
                                  type="date"
                                  value={txEndDate}
                                  onChange={(e) => { setTxEndDate(e.target.value); setTxPage(1) }}
                                  className="glass-input-base w-full cursor-pointer px-3 py-2.5 text-sm"
                                />
                              </div>
                              {(txType !== 'all' || txStartDate || txEndDate) && (
                                <button
                                  onClick={() => { setTxType('all'); setTxStartDate(''); setTxEndDate(''); setTxPage(1) }}
                                  className="glass-btn-base glass-btn-secondary cursor-pointer rounded-xl px-4 py-2.5 text-sm">
                                  {tb('reset')}
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 流水列表 */}
                        <div className="flex-1 overflow-y-auto">
                          {transactions.length > 0 ? (
                            <div className="space-y-2">
                              {transactions.map(tx => (
                                <div key={tx.id} className="glass-surface-soft flex items-center justify-between rounded-2xl border border-transparent p-4 transition-all hover:border-[var(--glass-stroke-focus)]">
                                  <div className="flex items-center gap-4">
                                    {(() => {
                                      const Icon = getTxIcon(tx)
                                      return (
                                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]">
                                          <Icon className="w-5 h-5" />
                                        </div>
                                      )
                                    })()}
                                    <div>
                                      <div className="text-sm font-medium text-[var(--glass-text-primary)]">
                                        {tx.type === 'recharge'
                                          ? (tx.description || t('recharge'))
                                          : (tx.action
                                            ? (t(`actionTypes.${tx.action}` as never) || tx.action)
                                            : (tx.description || t('consume')))
                                        }
                                      </div>
                                      {tx.type !== 'recharge' && (tx.billingMeta?.model || tx.projectName || tx.episodeNumber != null) && (
                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--glass-text-tertiary)]">
                                          {tx.billingMeta?.model && (
                                            <span className="inline-flex items-center gap-1">
                                              <AppIcon name="cpu" className="w-3 h-3 flex-shrink-0" />
                                              <span className="font-mono">{tx.billingMeta.model}</span>
                                            </span>
                                          )}
                                          {(() => {
                                            const detail = formatBillingDetail(tx.billingMeta, t as (key: string, values?: Record<string, unknown>) => string)
                                            return detail ? (
                                              <span className="inline-flex items-center gap-1">
                                                <AppIcon name="barChart" className="w-3 h-3 flex-shrink-0" />
                                                {detail}
                                              </span>
                                            ) : null
                                          })()}
                                          {tx.projectName && (
                                            <span className="inline-flex items-center gap-1">
                                              <AppIcon name="folderOpen" className="w-3 h-3 flex-shrink-0" />
                                              {tx.projectName}
                                            </span>
                                          )}
                                          {tx.episodeNumber != null && (
                                            <span className="inline-flex items-center gap-1">
                                              <AppIcon name="film" className="w-3 h-3 flex-shrink-0" />
                                              {t('episodeLabel', { number: tx.episodeNumber })}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      <div className="mt-0.5 text-xs text-[var(--glass-text-tertiary)]">{formatDate(tx.createdAt)}</div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-semibold text-[var(--glass-text-primary)]">
                                      {tx.type === 'recharge' ? '+' : ''}{formatMoney(Math.abs(tx.amount), currency)}
                                    </div>
                                    <div className="mt-0.5 text-xs text-[var(--glass-text-tertiary)]">{t('balanceAfter', { amount: formatMoney(tx.balanceAfter, currency) })}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center text-[var(--glass-text-tertiary)]">
                              <AppIcon name="file" className="mb-4 h-16 w-16 text-[var(--glass-stroke-strong)]" />
                              <p className="text-sm">{t('noTransactions')}</p>
                            </div>
                          )}
                        </div>

                        {/* 分页 */}
                        {transactionPagination && transactionPagination.totalPages > 1 && (
                          <div className="mt-4 flex items-center justify-between border-t border-[var(--glass-stroke-base)] pt-4">
                            <div className="text-sm text-[var(--glass-text-secondary)]">
                              {t('pagination', { total: transactionPagination.total, page: transactionPagination.page, totalPages: transactionPagination.totalPages })}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setTxPage(Math.max(1, txPage - 1))}
                                disabled={txPage === 1}
                                className="glass-btn-base glass-btn-secondary cursor-pointer rounded-lg px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >{t('previousPage')}</button>
                              <button
                                onClick={() => setTxPage(Math.min(transactionPagination.totalPages, txPage + 1))}
                                disabled={txPage === transactionPagination.totalPages}
                                className="glass-btn-base glass-btn-secondary cursor-pointer rounded-lg px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >{t('nextPage')}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : selectedProject === 'all' ? (
                      /* 项目列表 */
                      projects.length > 0 ? (
                        <div className="space-y-2">
                          {projects.map(p => (
                            <div key={p.projectId} onClick={() => setSelectedProject(p.projectId)} className="glass-surface-soft flex cursor-pointer items-center justify-between rounded-2xl border border-transparent p-4 transition-all hover:border-[var(--glass-stroke-focus)]">
                              <div>
                                <div className="font-medium text-[var(--glass-text-primary)]">{p.projectName}</div>
                                <div className="mt-0.5 text-xs text-[var(--glass-text-tertiary)]">{t('recordCount', { count: p.recordCount })}</div>
                              </div>
                              <div className="font-semibold text-[var(--glass-text-primary)]">{formatMoney(p.totalCost, currency)}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center text-[var(--glass-text-tertiary)]"><p className="text-sm">{t('noProjectCosts')}</p></div>
                      )
                    ) : detailsLoading ? (
                      <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="glass-surface-soft h-20 rounded-xl animate-pulse"></div>)}</div>
                    ) : projectDetails ? (
                      projectViewMode === 'summary' ? (
                        /* 汇总视图 */
                        <div className="space-y-6">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-[var(--glass-text-primary)]">{selectedProjectName}</h4>
                            <div className="text-lg font-bold text-[var(--glass-text-primary)]">{t('totalCost', { amount: formatMoney(projectDetails.total, currency) })}</div>
                          </div>

                          <div>
                            <h5 className="mb-3 text-sm font-medium text-[var(--glass-text-secondary)]">{t('byType')}</h5>
                            <div className="grid grid-cols-3 gap-3">
                              {projectDetails.byType.map(item => {
                                const colors = TYPE_COLORS[item.apiType] || { bg: 'bg-[var(--glass-bg-muted)]', text: 'text-[var(--glass-text-secondary)]', border: 'border-[var(--glass-stroke-base)]' }
                                return (
                                  <div
                                    key={item.apiType}
                                    onClick={() => { setProjectViewMode('records'); setRecordsFilter(item.apiType) }}
                                    className={`${colors.bg} ${colors.border} border rounded-2xl p-4 cursor-pointer transition-colors hover:border-[var(--glass-stroke-focus)]`}
                                  >
                                    <div className={`text-xs ${colors.text} font-medium`}>{t(`apiTypes.${item.apiType}` as never) || item.apiType}</div>
                                    <div className={`text-xl font-bold ${colors.text} mt-1`}>{formatMoney(item._sum.cost || 0, currency)}</div>
                                    <div className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{item._count} {t('times')}</div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          <div>
                            <h5 className="mb-3 text-sm font-medium text-[var(--glass-text-secondary)]">{t('byAction')}</h5>
                            <div className="space-y-2">
                              {projectDetails.byAction.map(item => (
                                <div key={item.action} className="glass-surface-soft flex items-center justify-between rounded-xl p-3">
                                  <div className="flex items-center gap-3">
                                    <div className="text-sm text-[var(--glass-text-primary)]">{t(`actionTypes.${item.action.replace(/-/g, '_')}` as never) || item.action}</div>
                                    <span className="text-xs text-[var(--glass-text-tertiary)]">{item._count} {t('times')}</span>
                                  </div>
                                  <div className="font-medium text-[var(--glass-text-secondary)]">{formatMoney(item._sum.cost || 0, currency)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* 流水视图 */
                        <div className="space-y-2">
                          {filteredRecords.length > 0 ? filteredRecords.map(record => {
                            const colors = TYPE_COLORS[record.apiType] || { bg: 'bg-[var(--glass-bg-muted)]', text: 'text-[var(--glass-text-secondary)]', border: 'border-[var(--glass-stroke-base)]' }
                            return (
                              <div key={record.id} className="glass-surface-soft flex items-center justify-between rounded-xl p-3">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-lg ${colors.bg} ${colors.text} flex items-center justify-center text-xs font-medium`}>
                                    {(t(`apiTypes.${record.apiType}` as never) || record.apiType).charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="text-sm text-[var(--glass-text-primary)]">{t(`actionTypes.${record.action.replace(/-/g, '_')}` as never) || record.action}</div>
                                    <div className="text-xs text-[var(--glass-text-tertiary)]">{record.model} · {formatDate(record.createdAt)}</div>
                                  </div>
                                </div>
                                <div className="font-medium text-[var(--glass-text-secondary)]">{formatMoney(record.cost, currency, 4)}</div>
                              </div>
                            )
                          }) : (
                            <div className="py-8 text-center text-sm text-[var(--glass-text-tertiary)]">{t('noRecords')}</div>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center text-[var(--glass-text-tertiary)]"><p className="text-sm">{t('noDetails')}</p></div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main >
    </div >
  )
}
