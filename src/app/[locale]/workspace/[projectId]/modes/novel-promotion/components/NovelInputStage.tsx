'use client'

/**
 * 小说推文模式 - 故事输入阶段 (Story View)
 * V3.2 UI: 极简版，专注剧本输入，资产管理移至资产库
 */

import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useState, useRef, useEffect, useMemo } from 'react'
import '@/styles/animations.css'
import { ART_STYLES, VIDEO_RATIOS } from '@/lib/constants'
import type {
  QuickMangaColorMode,
  QuickMangaLayout,
  QuickMangaPreset,
} from '@/lib/novel-promotion/quick-manga'
import type {
  QuickMangaContinuityConflictPolicy,
  QuickMangaContinuityMode,
  QuickMangaStyleLockProfile,
} from '@/lib/novel-promotion/quick-manga-contract'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon, RatioPreviewIcon } from '@/components/ui/icons'
import { useUserModels } from '@/lib/query/hooks'

/**
 * RatioIcon - 比例预览图标组件
 */
function RatioIcon({ ratio, size = 24, selected = false }: { ratio: string; size?: number; selected?: boolean }) {
  return <RatioPreviewIcon ratio={ratio} size={size} selected={selected} />
}

/**
 * RatioSelector - 比例选择下拉组件
 */
function RatioSelector({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption = options.find(o => o.value === value)

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="glass-input-base px-3 py-2.5 flex w-full items-center justify-between gap-2 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-3">
          <RatioIcon ratio={value} size={20} selected />
          <span className="text-sm text-[var(--glass-text-primary)] font-medium">{selectedOption?.label || value}</span>
        </div>
        <AppIcon name="chevronDown" className={`w-4 h-4 text-[var(--glass-text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉面板 - 横向网格布局 */}
      {isOpen && (
        <div className="glass-surface-modal absolute z-50 mt-1 left-0 right-0 p-3 max-h-60 overflow-y-auto custom-scrollbar" style={{ minWidth: '280px' }}>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-[var(--glass-bg-muted)]/70 transition-colors ${value === option.value
                  ? 'bg-[var(--glass-tone-info-bg)] shadow-[0_0_0_1px_rgba(79,128,255,0.35)]'
                  : ''
                  }`}
              >
                <RatioIcon ratio={option.value} size={28} selected={value === option.value} />
                <span className={`text-xs ${value === option.value ? 'text-[var(--glass-tone-info-fg)] font-medium' : 'text-[var(--glass-text-secondary)]'}`}>
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

type CharacterStrategyId = 'consistency-first' | 'emotion-first' | 'dynamic-action'
type EnvironmentPresetId = 'city-night-neon' | 'forest-mist-dawn' | 'interior-cinematic'

interface NovelInputStageProps {
  // 核心数据
  novelText: string
  // 当前剧集名称
  episodeName?: string
  journeyType?: 'film_video' | 'manga_webtoon'
  // 回调函数
  onNovelTextChange: (value: string) => void
  onNext: () => void
  // 状态
  isSubmittingTask?: boolean
  isSwitchingStage?: boolean
  // Quick Manga controls
  quickMangaEnabled?: boolean
  quickMangaPreset?: QuickMangaPreset
  quickMangaLayout?: QuickMangaLayout
  quickMangaColorMode?: QuickMangaColorMode
  onQuickMangaEnabledChange?: (enabled: boolean) => void
  onQuickMangaPresetChange?: (value: QuickMangaPreset) => void
  onQuickMangaLayoutChange?: (value: QuickMangaLayout) => void
  onQuickMangaColorModeChange?: (value: QuickMangaColorMode) => void
  quickMangaStyleLockEnabled?: boolean
  quickMangaStyleLockProfile?: QuickMangaStyleLockProfile
  quickMangaStyleLockStrength?: number
  quickMangaChapterContinuityMode?: QuickMangaContinuityMode
  quickMangaChapterId?: string | null
  quickMangaConflictPolicy?: QuickMangaContinuityConflictPolicy
  onQuickMangaStyleLockEnabledChange?: (enabled: boolean) => void
  onQuickMangaStyleLockProfileChange?: (value: QuickMangaStyleLockProfile) => void
  onQuickMangaStyleLockStrengthChange?: (value: number) => void
  onQuickMangaChapterContinuityModeChange?: (value: QuickMangaContinuityMode) => void
  onQuickMangaChapterIdChange?: (value: string | null) => void
  onQuickMangaConflictPolicyChange?: (value: QuickMangaContinuityConflictPolicy) => void
  // 旁白开关
  enableNarration?: boolean
  onEnableNarrationChange?: (enabled: boolean) => void
  // 配置项 - 比例与风格
  videoRatio?: string
  artStyle?: string
  onVideoRatioChange?: (value: string) => void
  onArtStyleChange?: (value: string) => void
  selectedCharacterStrategy?: CharacterStrategyId
  onCharacterStrategyChange?: (value: CharacterStrategyId) => void
  selectedEnvironmentId?: EnvironmentPresetId
  onEnvironmentChange?: (value: EnvironmentPresetId) => void
  onGenerateDemoSampleAssets?: () => Promise<{ mode: 'real' | 'fallback' | 'mixed'; realTriggered: number; fallbackApplied: number }>
  demoSampleAssetsPending?: boolean
}

export default function NovelInputStage({
  novelText,
  episodeName,
  journeyType = 'film_video',
  onNovelTextChange,
  onNext,
  isSubmittingTask = false,
  isSwitchingStage = false,
  quickMangaEnabled = false,
  quickMangaPreset = 'auto',
  quickMangaLayout = 'auto',
  quickMangaColorMode = 'auto',
  onQuickMangaEnabledChange,
  onQuickMangaPresetChange,
  onQuickMangaLayoutChange,
  onQuickMangaColorModeChange,
  quickMangaStyleLockEnabled = false,
  quickMangaStyleLockProfile = 'auto',
  quickMangaStyleLockStrength = 0.65,
  quickMangaChapterContinuityMode = 'off',
  quickMangaChapterId = null,
  quickMangaConflictPolicy = 'balanced',
  onQuickMangaStyleLockEnabledChange,
  onQuickMangaStyleLockProfileChange,
  onQuickMangaStyleLockStrengthChange,
  onQuickMangaChapterContinuityModeChange,
  onQuickMangaChapterIdChange,
  onQuickMangaConflictPolicyChange,
  enableNarration = false,
  onEnableNarrationChange,
  videoRatio = '9:16',
  artStyle = 'american-comic',
  onVideoRatioChange,
  onArtStyleChange,
  selectedCharacterStrategy = 'consistency-first',
  onCharacterStrategyChange,
  selectedEnvironmentId = 'city-night-neon',
  onEnvironmentChange,
  onGenerateDemoSampleAssets,
  demoSampleAssetsPending = false,
}: NovelInputStageProps) {
  const t = useTranslations('novelPromotion')
  const tStoryboard = useTranslations('storyboard')
  const hasContent = novelText.trim().length > 0
  const isMangaJourney = journeyType === 'manga_webtoon'
  const quickMangaPresetOptions = [
    { value: 'auto', label: t('storyInput.manga.preset.options.auto') },
    { value: 'action-battle', label: t('storyInput.manga.preset.options.actionBattle') },
    { value: 'romance-drama', label: t('storyInput.manga.preset.options.romanceDrama') },
    { value: 'slice-of-life', label: t('storyInput.manga.preset.options.sliceOfLife') },
    { value: 'comedy-4koma', label: t('storyInput.manga.preset.options.comedy4Koma') },
  ] as const
  const quickMangaLayoutOptions = [
    { value: 'auto', label: t('storyInput.manga.layout.options.auto') },
    { value: 'cinematic', label: t('storyInput.manga.layout.options.cinematic') },
    { value: 'four-koma', label: t('storyInput.manga.layout.options.fourKoma') },
    { value: 'vertical-scroll', label: t('storyInput.manga.layout.options.verticalScroll') },
    { value: 'splash-focus', label: t('storyInput.manga.layout.options.splashFocus') },
  ] as const
  const quickMangaColorOptions = [
    { value: 'auto', label: t('storyInput.manga.colorMode.options.auto') },
    { value: 'full-color', label: t('storyInput.manga.colorMode.options.fullColor') },
    { value: 'black-white', label: t('storyInput.manga.colorMode.options.blackWhite') },
    { value: 'limited-palette', label: t('storyInput.manga.colorMode.options.limitedPalette') },
  ] as const
  const stageSwitchingState = isSwitchingStage
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'text',
      hasOutput: false,
    })
    : null

  const userModelsQuery = useUserModels()
  const providerFirstModels = useMemo(() => {
    const imageModels = (userModelsQuery.data?.image ?? []) as Array<{ value?: string; label?: string; provider?: string; providerName?: string }>
    const normalized = imageModels
      .map((model) => ({
        value: (model.value || '').trim(),
        label: (model.label || model.value || '').trim(),
        provider: (model.provider || model.providerName || '').trim(),
      }))
      .filter((model) => model.value)

    const openaiCompat = normalized.filter((model) => model.provider.toLowerCase().includes('openai-compatible'))
    const geminiCompat = normalized.filter((model) => model.provider.toLowerCase().includes('gemini'))

    return {
      openaiCompat,
      geminiCompat,
      total: normalized.length,
    }
  }, [userModelsQuery.data?.image])

  const styleGalleryCards = useMemo(() => {
    const providerHint = providerFirstModels.openaiCompat.length > 0
      ? 'openai-compatible'
      : providerFirstModels.geminiCompat.length > 0
        ? 'gemini-compatible'
        : 'default'

    return ART_STYLES.map((style) => ({
      ...style,
      providerHint,
    }))
  }, [providerFirstModels.geminiCompat.length, providerFirstModels.openaiCompat.length])

  const characterStrategies: Array<{
    id: CharacterStrategyId
    title: string
    description: string
    badge: string
    icon: string
  }> = [
    {
      id: 'consistency-first',
      title: 'Nhất quán nhân vật',
      description: 'Giữ gương mặt, tóc và trang phục ổn định để xem liền mạch.',
      badge: 'An toàn',
      icon: '🧬',
    },
    {
      id: 'emotion-first',
      title: 'Ưu tiên cảm xúc',
      description: 'Đẩy mạnh biểu cảm để thumbnail và cảnh mở đầu hút mắt hơn.',
      badge: 'Nổi bật',
      icon: '🎭',
    },
    {
      id: 'dynamic-action',
      title: 'Hành động động',
      description: 'Tăng cảm giác chuyển động, hợp teaser/trailer ngắn.',
      badge: 'Sôi động',
      icon: '⚡',
    },
  ]

  const environmentGallery: Array<{
    id: EnvironmentPresetId
    title: string
    tone: string
    colors: string
    cover: string
    cue: string
  }> = [
    {
      id: 'city-night-neon',
      title: 'Neon City',
      tone: 'Đêm đô thị, tương phản cao',
      colors: 'from-cyan-500/20 via-blue-500/10 to-purple-500/20',
      cover: '/demo/novel-input/neon-city.svg',
      cue: 'Cyber · EDM · tốc độ',
    },
    {
      id: 'forest-mist-dawn',
      title: 'Forest Dawn',
      tone: 'Sương sớm nhẹ, ánh sáng dịu',
      colors: 'from-emerald-500/20 via-lime-500/10 to-cyan-500/20',
      cover: '/demo/novel-input/forest-dawn.svg',
      cue: 'Fantasy · chữa lành · mơ màng',
    },
    {
      id: 'interior-cinematic',
      title: 'Cinematic Interior',
      tone: 'Nội thất ấm, bóng đổ điện ảnh',
      colors: 'from-amber-500/20 via-orange-500/10 to-rose-500/20',
      cover: '/demo/novel-input/interior-cinematic.svg',
      cue: 'Drama · hội thoại · gần gũi',
    },
  ]

  const demoBundles = useMemo<Array<{
    id: string
    name: string
    outcome: string
    artStyle: string
    character: CharacterStrategyId
    environment: EnvironmentPresetId
  }>>(() => [
    {
      id: 'launch-teaser',
      name: 'Launch Teaser',
      outcome: 'Ra teaser nhanh cho social ads với nhịp cảnh mạnh.',
      artStyle: 'realistic',
      character: 'dynamic-action',
      environment: 'city-night-neon',
    },
    {
      id: 'brand-story',
      name: 'Brand Story',
      outcome: 'Kể câu chuyện thương hiệu với cảm xúc rõ ràng.',
      artStyle: 'american-comic',
      character: 'emotion-first',
      environment: 'interior-cinematic',
    },
    {
      id: 'product-explainer',
      name: 'Product Explainer',
      outcome: 'Giữ hình ảnh nhân vật ổn định cho video giới thiệu sản phẩm.',
      artStyle: 'japanese-anime',
      character: 'consistency-first',
      environment: 'forest-mist-dawn',
    },
  ], [])

  const activeBundleId = useMemo(() => {
    const matched = demoBundles.find((bundle) =>
      bundle.artStyle === artStyle &&
      bundle.character === selectedCharacterStrategy &&
      bundle.environment === selectedEnvironmentId
    )
    return matched?.id ?? null
  }, [artStyle, demoBundles, selectedCharacterStrategy, selectedEnvironmentId])

  const [sampleAssetSummary, setSampleAssetSummary] = useState<string>('')

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* 当前编辑剧集提示 - 顶部居中醒目显示 */}
      {episodeName && (
        <div className="text-center py-1">
          <div className="text-lg font-semibold text-[var(--glass-text-primary)]">
            {t("storyInput.currentEditing", { name: episodeName })}
          </div>
          <div className="text-sm text-[var(--glass-text-tertiary)] mt-1">{t("storyInput.editingTip")}</div>
        </div>
      )}

      {/* 主输入区域 */}
      <div className="glass-surface-elevated overflow-hidden">
        <div className="p-6">
          {/* 字数统计 */}
          <div className="flex items-center justify-end mb-3">
            <span className="glass-chip glass-chip-neutral text-xs">
              {t("storyInput.wordCount")} {novelText.length}
            </span>
          </div>

          {/* 剧本输入框 */}
          <textarea
            value={novelText}
            onChange={(e) => onNovelTextChange(e.target.value)}
            placeholder={tStoryboard('fixes.novelInputPlaceHolder')}
            className="glass-textarea-base custom-scrollbar h-80 px-4 py-3 text-base resize-none placeholder:text-[var(--glass-text-tertiary)]"
            disabled={isSubmittingTask || isSwitchingStage}
          />

          {/* 资产库引导提示 */}
          <div className="mt-5 p-4 glass-surface-soft">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 glass-surface-soft rounded-xl flex items-center justify-center flex-shrink-0">
                <AppIcon name="folderCards" className="w-5 h-5 text-[var(--glass-text-secondary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[var(--glass-text-secondary)] mb-1">{t("storyInput.assetLibraryTip.title")}</div>
                <p className="text-sm text-[var(--glass-text-tertiary)] leading-relaxed">
                  {t("storyInput.assetLibraryTip.description")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Manga/Webtoon kickoff controls */}
      {isMangaJourney && (
      <div className="glass-surface p-6 relative z-10 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--glass-text-muted)] tracking-[0.01em]">{t('storyInput.manga.title')}</h3>
            <p className="text-xs text-[var(--glass-text-tertiary)] mt-1">{t('storyInput.manga.description')}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-[var(--glass-text-primary)]">{t('storyInput.manga.toggle')}</span>
            <button
              type="button"
              onClick={() => onQuickMangaEnabledChange?.(!quickMangaEnabled)}
              className={`relative w-14 h-8 rounded-full transition-colors ${quickMangaEnabled
                ? 'bg-[var(--glass-accent-from)]'
                : 'bg-[var(--glass-stroke-strong)]'
                }`}
              aria-label={t('storyInput.manga.toggle')}
              aria-pressed={quickMangaEnabled}
            >
              <span
                className={`absolute top-1 left-1 w-6 h-6 bg-[var(--glass-bg-surface)] rounded-full shadow-sm transition-transform ${quickMangaEnabled ? 'translate-x-6' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </div>

        {quickMangaEnabled && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="space-y-2">
                <span className="text-xs font-semibold text-[var(--glass-text-muted)]">{t('storyInput.manga.preset.label')}</span>
                <select
                  value={quickMangaPreset}
                  onChange={(event) => onQuickMangaPresetChange?.(event.target.value as QuickMangaPreset)}
                  className="glass-input-base px-3 py-2.5 w-full text-sm"
                >
                  {quickMangaPresetOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-[var(--glass-text-muted)]">{t('storyInput.manga.layout.label')}</span>
                <select
                  value={quickMangaLayout}
                  onChange={(event) => onQuickMangaLayoutChange?.(event.target.value as QuickMangaLayout)}
                  className="glass-input-base px-3 py-2.5 w-full text-sm"
                >
                  {quickMangaLayoutOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-[var(--glass-text-muted)]">{t('storyInput.manga.colorMode.label')}</span>
                <select
                  value={quickMangaColorMode}
                  onChange={(event) => onQuickMangaColorModeChange?.(event.target.value as QuickMangaColorMode)}
                  className="glass-input-base px-3 py-2.5 w-full text-sm"
                >
                  {quickMangaColorOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/20 p-4 space-y-4">
              <div className="text-xs font-semibold text-[var(--glass-text-muted)] uppercase tracking-wide">
                {t('storyInput.manga.controls.title')}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[var(--glass-text-muted)]">{t('storyInput.manga.controls.styleLock.enabled')}</span>
                  <button
                    type="button"
                    onClick={() => onQuickMangaStyleLockEnabledChange?.(!quickMangaStyleLockEnabled)}
                    className={`relative w-14 h-8 rounded-full transition-colors ${quickMangaStyleLockEnabled
                      ? 'bg-[var(--glass-accent-from)]'
                      : 'bg-[var(--glass-stroke-strong)]'
                      }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-6 h-6 bg-[var(--glass-bg-surface)] rounded-full shadow-sm transition-transform ${quickMangaStyleLockEnabled ? 'translate-x-6' : 'translate-x-0'}`}
                    />
                  </button>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[var(--glass-text-muted)]">{t('storyInput.manga.controls.styleLock.profile')}</span>
                  <select
                    value={quickMangaStyleLockProfile}
                    onChange={(event) => onQuickMangaStyleLockProfileChange?.(event.target.value as QuickMangaStyleLockProfile)}
                    className="glass-input-base px-3 py-2.5 w-full text-sm"
                  >
                    <option value="auto">auto</option>
                    <option value="line-consistent">line-consistent</option>
                    <option value="ink-contrast">ink-contrast</option>
                    <option value="soft-tones">soft-tones</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[var(--glass-text-muted)]">{t('storyInput.manga.controls.styleLock.strength')}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={quickMangaStyleLockStrength}
                    onChange={(event) => onQuickMangaStyleLockStrengthChange?.(Number(event.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-[var(--glass-text-tertiary)]">{Math.round(quickMangaStyleLockStrength * 100)}%</div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[var(--glass-text-muted)]">{t('storyInput.manga.controls.chapter.mode')}</span>
                  <select
                    value={quickMangaChapterContinuityMode}
                    onChange={(event) => onQuickMangaChapterContinuityModeChange?.(event.target.value as QuickMangaContinuityMode)}
                    className="glass-input-base px-3 py-2.5 w-full text-sm"
                  >
                    <option value="off">off</option>
                    <option value="chapter-strict">chapter-strict</option>
                    <option value="chapter-flex">chapter-flex</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[var(--glass-text-muted)]">{t('storyInput.manga.controls.chapter.id')}</span>
                  <input
                    value={quickMangaChapterId || ''}
                    onChange={(event) => onQuickMangaChapterIdChange?.(event.target.value || null)}
                    placeholder={t('storyInput.manga.controls.chapter.idPlaceholder')}
                    className="glass-input-base px-3 py-2.5 w-full text-sm"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[var(--glass-text-muted)]">{t('storyInput.manga.controls.chapter.conflictPolicy')}</span>
                  <select
                    value={quickMangaConflictPolicy}
                    onChange={(event) => onQuickMangaConflictPolicyChange?.(event.target.value as QuickMangaContinuityConflictPolicy)}
                    className="glass-input-base px-3 py-2.5 w-full text-sm"
                  >
                    <option value="balanced">balanced</option>
                    <option value="prefer-style-lock">prefer-style-lock</option>
                    <option value="prefer-chapter-context">prefer-chapter-context</option>
                  </select>
                </label>
              </div>

              <p className="text-xs text-[var(--glass-text-tertiary)]">
                {t('storyInput.manga.controls.conflictHelp')}
              </p>
            </div>
          </>
        )}
      </div>
      )}

      {/* VAT-121: demo-focused flow */}
      <div className="glass-surface p-6 space-y-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-[var(--glass-text-muted)] tracking-[0.01em]">Demo flow setup</h3>
          <p className="text-xs text-[var(--glass-text-tertiary)]">Chọn outcome kinh doanh trước, sau đó chốt style + nhân vật + bối cảnh để ra script demo mạch hơn.</p>
        </div>

        <div className="rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/15 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-[var(--glass-text-secondary)]">
              Model route: {providerFirstModels.openaiCompat.length > 0 ? 'OpenAI-compatible' : providerFirstModels.geminiCompat.length > 0 ? 'Gemini-compatible' : 'Default'}
            </p>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <p className="text-xs text-[var(--glass-text-tertiary)]">Image models khả dụng: {providerFirstModels.total}</p>
              {onGenerateDemoSampleAssets && (
                <button
                  type="button"
                  disabled={demoSampleAssetsPending}
                  onClick={async () => {
                    const result = await onGenerateDemoSampleAssets()
                    if (result.mode === 'real') {
                      setSampleAssetSummary(`Sample assets: real ${result.realTriggered}, fallback ${result.fallbackApplied}`)
                    } else if (result.mode === 'mixed') {
                      setSampleAssetSummary(`Sample assets: mixed real ${result.realTriggered}, fallback ${result.fallbackApplied}`)
                    } else {
                      setSampleAssetSummary(`Sample assets: fallback ${result.fallbackApplied}`)
                    }
                  }}
                  className="glass-btn-base px-3 py-1.5 text-xs"
                >
                  {demoSampleAssetsPending ? 'Đang tạo sample assets...' : 'Tạo sample assets'}
                </button>
              )}
            </div>
          </div>
          {sampleAssetSummary && (
            <div className="mt-3 rounded-lg border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/20 px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
              {sampleAssetSummary}
            </div>
          )}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            {demoBundles.map((bundle) => {
              const active = activeBundleId === bundle.id
              return (
                <button
                  key={bundle.id}
                  type="button"
                  onClick={() => {
                    onArtStyleChange?.(bundle.artStyle)
                    onCharacterStrategyChange?.(bundle.character)
                    onEnvironmentChange?.(bundle.environment)
                  }}
                  className={`rounded-xl border p-3 text-left transition-all ${active
                    ? 'border-[var(--glass-accent-from)] bg-[var(--glass-tone-info-bg)]/25'
                    : 'border-[var(--glass-stroke-soft)] hover:bg-[var(--glass-bg-muted)]/30'
                    }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--glass-text-primary)]">{bundle.name}</span>
                    {active && <AppIcon name="check" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />}
                  </div>
                  <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{bundle.outcome}</p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-[var(--glass-text-primary)]">Tỉ lệ khung hình</h4>
            <RatioSelector
              value={videoRatio}
              onChange={(value) => onVideoRatioChange?.(value)}
              options={VIDEO_RATIOS}
            />
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-[var(--glass-text-primary)]">Visual style</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {styleGalleryCards.map((style) => {
                const selected = style.value === artStyle
                return (
                  <button
                    key={style.value}
                    type="button"
                    onClick={() => onArtStyleChange?.(style.value)}
                    className={`rounded-xl border p-3 text-left transition-all ${selected
                      ? 'border-[var(--glass-accent-from)] bg-[var(--glass-tone-info-bg)]/30 shadow-[0_8px_24px_rgba(79,128,255,0.15)]'
                      : 'border-[var(--glass-stroke-soft)] hover:bg-[var(--glass-bg-muted)]/30'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg">{style.preview}</span>
                      {selected && <AppIcon name="check" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-[var(--glass-text-primary)]">{style.label}</div>
                    <div className="mt-1 text-[11px] text-[var(--glass-text-tertiary)]">{selected ? 'Đang áp cho script demo' : style.providerHint}</div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/15 p-4 space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-[var(--glass-text-primary)]">Định hướng nhân vật</h4>
              <p className="text-xs text-[var(--glass-text-tertiary)] mt-1">Tối ưu cảm xúc/nhận diện cho những cảnh mở đầu để khách thấy rõ concept.</p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {characterStrategies.map((strategy) => {
                const active = strategy.id === selectedCharacterStrategy
                return (
                  <button
                    key={strategy.id}
                    type="button"
                    onClick={() => onCharacterStrategyChange?.(strategy.id)}
                    className={`rounded-xl border p-3 text-left transition-all ${active
                      ? 'border-[var(--glass-accent-from)] bg-[var(--glass-tone-info-bg)]/25'
                      : 'border-[var(--glass-stroke-soft)] hover:bg-[var(--glass-bg-muted)]/25'
                      }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[var(--glass-text-primary)] flex items-center gap-2">
                        <span>{strategy.icon}</span>
                        <span>{strategy.title}</span>
                      </span>
                      <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]">{strategy.badge}</span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--glass-text-tertiary)]">{strategy.description}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/15 p-4 space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-[var(--glass-text-primary)]">Bối cảnh trình diễn</h4>
              <p className="text-xs text-[var(--glass-text-tertiary)] mt-1">Khớp mood visual với thông điệp sản phẩm để demo thuyết phục hơn.</p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {environmentGallery.map((environment) => {
                const active = environment.id === selectedEnvironmentId
                return (
                  <button
                    key={environment.id}
                    type="button"
                    onClick={() => onEnvironmentChange?.(environment.id)}
                    className={`rounded-xl border p-0 text-left overflow-hidden transition-all ${active
                      ? 'border-[var(--glass-accent-from)] shadow-[0_0_0_1px_rgba(79,128,255,0.2)]'
                      : 'border-[var(--glass-stroke-soft)] hover:border-[var(--glass-stroke-strong)]'
                      }`}
                  >
                    <div className="h-24 relative overflow-hidden">
                      <Image
                        src={environment.cover}
                        alt={environment.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover"
                      />
                      <div className={`absolute inset-0 bg-gradient-to-br ${environment.colors}`} />
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-[var(--glass-text-primary)]">{environment.title}</div>
                        {active && <AppIcon name="check" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />}
                      </div>
                      <div className="text-xs text-[var(--glass-text-tertiary)] mt-1">{environment.tone}</div>
                      <div className="text-[11px] text-[var(--glass-text-secondary)] mt-1">{environment.cue}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {isMangaJourney && (
          <div className="rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/10 px-3 py-2 text-xs text-[var(--glass-text-tertiary)]">
            Tip: Manga/Webtoon lane đã có thêm Quick Manga controls phía trên để tối ưu continuity theo chapter.
          </div>
        )}
      </div>

      {/* 旁白开关 + 操作按钮 */}
      <div className="glass-surface p-6">
        {/* 旁白开关 */}
        {onEnableNarrationChange && (
          <div className="glass-surface-soft flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl mb-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] font-semibold text-sm">VO</span>
              <div>
                <div className="font-medium text-[var(--glass-text-primary)]">{t("storyInput.narration.title")}</div>
                <div className="text-xs text-[var(--glass-text-tertiary)]">{t("storyInput.narration.description")}</div>
              </div>
            </div>
            <button
              onClick={() => onEnableNarrationChange(!enableNarration)}
              className={`relative w-14 h-8 rounded-full transition-colors ${enableNarration
                ? 'bg-[var(--glass-accent-from)]'
                : 'bg-[var(--glass-stroke-strong)]'
                }`}
            >
              <span
                className={`absolute top-1 left-1 w-6 h-6 bg-[var(--glass-bg-surface)] rounded-full shadow-sm transition-transform ${enableNarration ? 'translate-x-6' : 'translate-x-0'
                  }`}
              />
            </button>
          </div>
        )}

        {/* 开始创作按钮 */}
        <button
          onClick={onNext}
          disabled={!hasContent || isSubmittingTask || isSwitchingStage}
          className="glass-btn-base glass-btn-primary w-full py-4 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {isSwitchingStage ? (
            <TaskStatusInline state={stageSwitchingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
          ) : (
            <>
              <span>{isMangaJourney ? 'Tạo Script Demo (Manga)' : 'Tạo Script Demo (Film)'}</span>
              <AppIcon name="arrowRight" className="w-5 h-5" />
            </>
          )}
        </button>
        <p className="text-center text-xs text-[var(--glass-text-tertiary)] mt-3">
          {hasContent ? t("storyInput.ready") : t("storyInput.pleaseInput")}
        </p>
      </div>
    </div>
  )
}
