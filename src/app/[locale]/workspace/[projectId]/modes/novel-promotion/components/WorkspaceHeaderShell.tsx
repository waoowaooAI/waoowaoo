'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { CapsuleNav, EpisodeSelector } from '@/components/ui/CapsuleNav'
import { SettingsModal, WorldContextModal } from '@/components/ui/ConfigModals'
import { AppIcon } from '@/components/ui/icons'
import WorkspaceTopActions from './WorkspaceTopActions'
import type { NovelPromotionPanel } from '@/types/project'
import type { CapabilitySelections, ModelCapabilities } from '@/lib/model-config-contract'

interface EpisodeSummary {
  id: string
  name: string
  episodeNumber?: number
  description?: string | null
  clips?: unknown[]
  storyboards?: Array<{
    panels?: NovelPromotionPanel[] | null
  }>
}

interface UserModelOption {
  value: string
  label: string
  provider?: string
  providerName?: string
  capabilities?: ModelCapabilities
}

interface UserModelsPayload {
  llm: UserModelOption[]
  image: UserModelOption[]
  video: UserModelOption[]
}

interface WorkspaceHeaderShellProps {
  isSettingsModalOpen: boolean
  isWorldContextModalOpen: boolean
  onCloseSettingsModal: () => void
  onCloseWorldContextModal: () => void
  availableModels?: UserModelsPayload
  modelsLoaded: boolean
  artStyle: string | null | undefined
  analysisModel: string | null | undefined
  characterModel: string | null | undefined
  locationModel: string | null | undefined
  storyboardModel: string | null | undefined
  editModel: string | null | undefined
  videoModel: string | null | undefined
  capabilityOverrides: CapabilitySelections
  videoRatio: string | null | undefined
  ttsRate: string | null | undefined
  onUpdateConfig: (key: string, value: unknown) => Promise<void>
  globalAssetText: string
  projectName: string
  episodes: EpisodeSummary[]
  currentEpisodeId?: string
  onEpisodeSelect?: (episodeId: string) => void
  onEpisodeCreate?: () => void
  onEpisodeRename?: (episodeId: string, newName: string) => void
  onEpisodeDelete?: (episodeId: string) => void
  capsuleNavItems: Array<{
    id: string
    icon: string
    label: string
    status: 'empty' | 'active' | 'processing' | 'ready'
    disabled?: boolean
    disabledLabel?: string
  }>
  currentStage: string
  onStageChange: (stage: string) => void
  projectId: string
  episodeId?: string
  onOpenAssetLibrary: () => void
  onOpenSettingsModal: () => void
  onRefresh: () => void
  assetLibraryLabel: string
  settingsLabel: string
  refreshTitle: string
}

export default function WorkspaceHeaderShell({
  isSettingsModalOpen,
  isWorldContextModalOpen,
  onCloseSettingsModal,
  onCloseWorldContextModal,
  availableModels,
  modelsLoaded,
  artStyle,
  analysisModel,
  characterModel,
  locationModel,
  storyboardModel,
  editModel,
  videoModel,
  capabilityOverrides,
  videoRatio,
  ttsRate,
  onUpdateConfig,
  globalAssetText,
  projectName,
  episodes,
  currentEpisodeId,
  onEpisodeSelect,
  onEpisodeCreate,
  onEpisodeRename,
  onEpisodeDelete,
  capsuleNavItems,
  currentStage,
  onStageChange,
  projectId,
  episodeId,
  onOpenAssetLibrary,
  onOpenSettingsModal,
  onRefresh,
  assetLibraryLabel,
  settingsLabel,
  refreshTitle,
}: WorkspaceHeaderShellProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [isMobile, setIsMobile] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 639px)')
    const syncViewport = () => {
      const mobile = mediaQuery.matches
      setIsMobile(mobile)
      if (!mobile) {
        setIsMobileMenuOpen(false)
      }
    }

    syncViewport()
    mediaQuery.addEventListener('change', syncViewport)
    window.addEventListener('orientationchange', syncViewport)

    return () => {
      mediaQuery.removeEventListener('change', syncViewport)
      window.removeEventListener('orientationchange', syncViewport)
    }
  }, [])

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname, searchParams])

  useEffect(() => {
    if (!isMobile || !isMobileMenuOpen) {
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
      return
    }

    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'

    return () => {
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
    }
  }, [isMobile, isMobileMenuOpen])

  const mobileMenuPanelId = 'workspace-mobile-menu-panel'

  const sortedEpisodes = useMemo(() => {
    const getNum = (name: string) => { const m = name.match(/\d+/); return m ? parseInt(m[0], 10) : Infinity }
    return [...episodes].sort((a, b) => {
      const d = getNum(a.name) - getNum(b.name)
      return d !== 0 ? d : a.name.localeCompare(b.name, 'zh')
    })
  }, [episodes])

  const episodeSelectorNode = episodes.length > 0 && currentEpisodeId ? (
    <EpisodeSelector
      projectName={projectName}
      episodes={sortedEpisodes.map((ep) => ({
        id: ep.id,
        title: ep.name,
        summary: ep.description ?? undefined,
        status: {
          script: ep.clips?.length ? 'ready' as const : 'empty' as const,
          visual: ep.storyboards?.some((sb) => sb.panels?.some((panel) => panel.videoUrl)) ? 'ready' as const : 'empty' as const,
        },
      }))}
      currentId={currentEpisodeId}
      onSelect={(id) => onEpisodeSelect?.(id)}
      onAdd={onEpisodeCreate}
      onRename={(id, newName) => onEpisodeRename?.(id, newName)}
      onDelete={onEpisodeDelete}
    />
  ) : null

  return (
    <>
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={onCloseSettingsModal}
        availableModels={availableModels}
        modelsLoaded={modelsLoaded}
        artStyle={artStyle ?? undefined}
        analysisModel={analysisModel ?? undefined}
        characterModel={characterModel ?? undefined}
        locationModel={locationModel ?? undefined}
        imageModel={storyboardModel ?? undefined}
        editModel={editModel ?? undefined}
        videoModel={videoModel ?? undefined}
        videoRatio={videoRatio ?? undefined}
        capabilityOverrides={capabilityOverrides}
        ttsRate={ttsRate ?? undefined}
        onArtStyleChange={(value) => { onUpdateConfig('artStyle', value) }}
        onAnalysisModelChange={(value) => { onUpdateConfig('analysisModel', value) }}
        onCharacterModelChange={(value) => { onUpdateConfig('characterModel', value) }}
        onLocationModelChange={(value) => { onUpdateConfig('locationModel', value) }}
        onImageModelChange={(value) => { onUpdateConfig('storyboardModel', value) }}
        onEditModelChange={(value) => { onUpdateConfig('editModel', value) }}
        onVideoModelChange={(value) => { onUpdateConfig('videoModel', value) }}
        onVideoRatioChange={(value) => { onUpdateConfig('videoRatio', value) }}
        onCapabilityOverridesChange={(value) => { onUpdateConfig('capabilityOverrides', value) }}
        onTTSRateChange={(value) => { onUpdateConfig('ttsRate', value) }}
      />

      <WorldContextModal
        isOpen={isWorldContextModalOpen}
        onClose={onCloseWorldContextModal}
        text={globalAssetText}
        onChange={(value) => { onUpdateConfig('globalAssetText', value) }}
      />

      {isMobile && (
        <button
          type="button"
          aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMobileMenuOpen}
          aria-controls={mobileMenuPanelId}
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          className={`fixed left-3 top-[calc(env(safe-area-inset-top,0px)+4.5rem)] h-11 w-11 rounded-2xl glass-btn-base transition-opacity ${isMobileMenuOpen
            ? 'z-[58] glass-btn-tone-info'
            : 'z-[70] glass-btn-secondary'
            }`}
        >
          <AppIcon name={isMobileMenuOpen ? 'close' : 'menu'} className="h-5 w-5" />
        </button>
      )}

      {!isMobile && episodeSelectorNode}

      {!isMobile && (
        <CapsuleNav
          items={capsuleNavItems}
          activeId={currentStage}
          onItemClick={onStageChange}
          projectId={projectId}
          episodeId={episodeId}
        />
      )}

      {!isMobile && (
        <WorkspaceTopActions
          onOpenAssetLibrary={onOpenAssetLibrary}
          onOpenSettings={onOpenSettingsModal}
          onRefresh={onRefresh}
          assetLibraryLabel={assetLibraryLabel}
          settingsLabel={settingsLabel}
          refreshTitle={refreshTitle}
        />
      )}

      {isMobile && isMobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-[65] glass-overlay"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden
          />

          <aside
            id={mobileMenuPanelId}
            className="fixed inset-x-2 top-[calc(env(safe-area-inset-top,0px)+7.25rem)] bottom-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] z-[70] glass-surface-modal rounded-2xl p-3 overflow-y-auto overscroll-contain"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile workspace navigation"
          >
            <div className="space-y-4 pb-2">
              {sortedEpisodes.length > 0 && currentEpisodeId && (
                <section>
                  <p className="text-xs font-semibold text-[var(--glass-text-tertiary)] mb-2">{projectName}</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {sortedEpisodes.map((ep) => (
                      <button
                        key={ep.id}
                        type="button"
                        onClick={() => {
                          onEpisodeSelect?.(ep.id)
                          setIsMobileMenuOpen(false)
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors ${ep.id === currentEpisodeId
                          ? 'glass-btn-base glass-btn-tone-info'
                          : 'glass-btn-base glass-btn-secondary text-[var(--glass-text-primary)]'
                          }`}
                      >
                        <span className="truncate">{ep.name}</span>
                        {ep.id === currentEpisodeId && <AppIcon name="check" className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="grid grid-cols-2 gap-2">
                  {capsuleNavItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={item.disabled}
                      onClick={() => {
                        onStageChange(item.id)
                        setIsMobileMenuOpen(false)
                      }}
                      className={`glass-btn-base px-3 py-2.5 rounded-xl text-sm font-medium ${item.id === currentStage
                        ? 'glass-btn-tone-info'
                        : 'glass-btn-secondary text-[var(--glass-text-primary)]'
                        } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onOpenAssetLibrary()
                      setIsMobileMenuOpen(false)
                    }}
                    className="glass-btn-base glass-btn-secondary w-full px-3 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <AppIcon name="package" className="h-4 w-4" />
                    <span>{assetLibraryLabel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSettingsModal()
                      setIsMobileMenuOpen(false)
                    }}
                    className="glass-btn-base glass-btn-secondary w-full px-3 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <AppIcon name="settingsHexMinor" className="h-4 w-4" />
                    <span>{settingsLabel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRefresh()
                      setIsMobileMenuOpen(false)
                    }}
                    className="glass-btn-base glass-btn-secondary w-full px-3 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                    title={refreshTitle}
                  >
                    <AppIcon name="refresh" className="h-4 w-4" />
                    <span>{refreshTitle}</span>
                  </button>
                </div>
              </section>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
