'use client'

import { useCallback, useEffect, useState } from 'react'
import { logInfo as _ulogInfo, logWarn as _ulogWarn, logError as _ulogError } from '@/lib/logging/core'
import { detectEpisodeMarkers, type EpisodeMarkerResult } from '@/lib/episode-marker-detector'
import { countWords } from '@/lib/word-count'
import {
  useListProjectEpisodes,
  useSaveProjectEpisodesBatch,
  useSplitProjectEpisodes,
  useSplitProjectEpisodesByMarkers,
} from '@/lib/query/hooks'
import type { DeleteConfirmState, SplitEpisode, WizardStage } from '../types'

type TranslateValues = Record<string, string | number | Date>
type Translate = (key: string, values?: TranslateValues) => string

interface UseWizardStateParams {
  projectId: string
  importStatus?: string | null
  onImportComplete: (episodes: SplitEpisode[], triggerGlobalAnalysis?: boolean) => void
  t: Translate
}

export function useWizardState({ projectId, importStatus, onImportComplete, t }: UseWizardStateParams) {
  const initialStage: WizardStage = importStatus === 'pending' ? 'preview' : 'select'
  const [stage, setStage] = useState<WizardStage>(initialStage)
  const [rawContent, setRawContent] = useState('')
  const [episodes, setEpisodes] = useState<SplitEpisode[]>([])
  const [selectedEpisode, setSelectedEpisode] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>({ show: false, index: -1, title: '' })
  const [markerResult, setMarkerResult] = useState<EpisodeMarkerResult | null>(null)
  const [showMarkerConfirm, setShowMarkerConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  const listProjectEpisodesMutation = useListProjectEpisodes(projectId)
  const splitProjectEpisodesMutation = useSplitProjectEpisodes(projectId)
  const splitProjectEpisodesByMarkersMutation = useSplitProjectEpisodesByMarkers(projectId)
  const saveProjectEpisodesBatchMutation = useSaveProjectEpisodesBatch(projectId)

  const loadSavedEpisodes = useCallback(async () => {
    try {
      const data = await listProjectEpisodesMutation.mutateAsync()
      if (data.episodes && data.episodes.length > 0) {
        const loadedEpisodes: SplitEpisode[] = data.episodes.map((ep: { episodeNumber?: number; name?: string; description?: string; novelText?: string }, idx: number) => ({
          number: ep.episodeNumber || idx + 1,
          title: ep.name || t('episode', { num: idx + 1 }),
          summary: ep.description || '',
          content: ep.novelText || '',
          wordCount: countWords(ep.novelText || ''),
        }))
        setEpisodes(loadedEpisodes)
        setStage('preview')
      }
    } catch (err) {
      _ulogError('[SmartImport] 加载已保存剧集失败:', err)
    }
  }, [listProjectEpisodesMutation, t])

  useEffect(() => {
    if (importStatus === 'pending' && episodes.length === 0) {
      void loadSavedEpisodes()
    }
  }, [episodes.length, importStatus, loadSavedEpisodes])

  const performAISplit = useCallback(async () => {
    setShowMarkerConfirm(false)
    setStage('analyzing')
    setError(null)

    try {
      _ulogInfo('[SmartImport] 开始调用 split API...')
      const data = await splitProjectEpisodesMutation.mutateAsync({ content: rawContent, async: true })
      const splitEpisodes = data.episodes || []
      setEpisodes(splitEpisodes)

      let saveSucceeded = true
      try {
        await saveProjectEpisodesBatchMutation.mutateAsync({
          episodes: splitEpisodes.map((ep: SplitEpisode) => ({
            name: ep.title,
            description: ep.summary,
            novelText: ep.content,
          })),
          clearExisting: true,
          importStatus: 'pending',
        })
      } catch {
        saveSucceeded = false
        _ulogWarn('[SmartImport] 自动保存失败，继续显示预览')
      }
      if (saveSucceeded) {
        _ulogInfo('[SmartImport] 剧集已自动保存到数据库，状态：pending')
      }

      setStage('preview')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('errors.analyzeFailed')
      setError(message || t('errors.analyzeFailed'))
      setStage('select')
    }
  }, [rawContent, saveProjectEpisodesBatchMutation, splitProjectEpisodesMutation, t])

  const handleAnalyze = useCallback(async () => {
    _ulogInfo('[SmartImport] handleAnalyze 被调用')
    _ulogInfo('[SmartImport] rawContent 长度:', rawContent.length)
    _ulogInfo('[SmartImport] projectId:', projectId)

    if (!rawContent.trim()) {
      setError(t('errors.uploadFirst'))
      return
    }

    const detection = detectEpisodeMarkers(rawContent)
    _ulogInfo('[SmartImport] 标记检测结果:', {
      hasMarkers: detection.hasMarkers,
      markerType: detection.markerType,
      confidence: detection.confidence,
      matchCount: detection.matches.length,
      previewSplitsCount: detection.previewSplits.length,
    })

    if (detection.hasMarkers) {
      setMarkerResult(detection)
      setShowMarkerConfirm(true)
      return
    }

    _ulogInfo('[SmartImport] 未检测到标记，将使用 AI 分析')
    await performAISplit()
  }, [performAISplit, projectId, rawContent, t])

  const handleMarkerSplit = useCallback(async () => {
    if (!markerResult) return

    setShowMarkerConfirm(false)
    setStage('analyzing')
    setError(null)

    try {
      const data = await splitProjectEpisodesByMarkersMutation.mutateAsync({ content: rawContent })
      const splitEpisodes = data.episodes || []
      setEpisodes(splitEpisodes)

      let saveSucceeded = true
      try {
        await saveProjectEpisodesBatchMutation.mutateAsync({
          episodes: splitEpisodes.map((ep: SplitEpisode) => ({
            name: ep.title,
            description: ep.summary,
            novelText: ep.content,
          })),
          clearExisting: true,
          importStatus: 'pending',
        })
      } catch {
        saveSucceeded = false
        _ulogWarn('[SmartImport] 标记分割保存失败，继续显示预览')
      }
      if (saveSucceeded) {
        _ulogInfo('[SmartImport] 标记分割剧集已保存')
      }

      setStage('preview')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('errors.analyzeFailed')
      setError(message || t('errors.analyzeFailed'))
      setStage('select')
    }
  }, [markerResult, rawContent, saveProjectEpisodesBatchMutation, splitProjectEpisodesByMarkersMutation, t])

  const updateEpisodeTitle = useCallback((index: number, title: string) => {
    setEpisodes((prev) => prev.map((ep, i) => (i === index ? { ...ep, title } : ep)))
  }, [])

  const updateEpisodeSummary = useCallback((index: number, summary: string) => {
    setEpisodes((prev) => prev.map((ep, i) => (i === index ? { ...ep, summary } : ep)))
  }, [])

  const updateEpisodeNumber = useCallback((index: number, number: number) => {
    setEpisodes((prev) => prev.map((ep, i) => (i === index ? { ...ep, number } : ep)))
  }, [])

  const updateEpisodeContent = useCallback((index: number, content: string) => {
    setEpisodes((prev) => prev.map((ep, i) => (i === index ? { ...ep, content, wordCount: countWords(content) } : ep)))
  }, [])

  const deleteEpisode = useCallback((index: number) => {
    setEpisodes((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((_, i) => i !== index)
      setSelectedEpisode((current) => (current >= next.length ? Math.max(0, next.length - 1) : current))
      return next
    })
  }, [])

  const addEpisode = useCallback(() => {
    setEpisodes((prev) => {
      const newEpisode: SplitEpisode = {
        number: prev.length + 1,
        title: `${t('preview.newEpisode')} ${prev.length + 1}`,
        summary: '',
        content: '',
        wordCount: 0,
      }
      const next = [...prev, newEpisode]
      setSelectedEpisode(next.length - 1)
      return next
    })
  }, [t])

  const openDeleteConfirm = useCallback((index: number, title: string) => {
    setDeleteConfirm({ show: true, index, title })
  }, [])

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirm({ show: false, index: -1, title: '' })
  }, [])

  const confirmDeleteEpisode = useCallback(() => {
    if (deleteConfirm.index >= 0) {
      deleteEpisode(deleteConfirm.index)
    }
    closeDeleteConfirm()
  }, [closeDeleteConfirm, deleteConfirm.index, deleteEpisode])

  const handleConfirm = useCallback(async (triggerGlobalAnalysis = false) => {
    setSaving(true)
    setError(null)

    try {
      await saveProjectEpisodesBatchMutation.mutateAsync({
        episodes: episodes.map((ep) => ({
          name: ep.title,
          description: ep.summary,
          novelText: ep.content,
        })),
        clearExisting: true,
        importStatus: 'completed',
        triggerGlobalAnalysis,
      })

      _ulogInfo('[SmartImport] 剧集已保存到数据库，状态：completed, 触发全局分析:', triggerGlobalAnalysis)
      onImportComplete(episodes, triggerGlobalAnalysis)
    } catch (err: unknown) {
      _ulogError('[SmartImport] 保存失败:', err)
      const message = err instanceof Error ? err.message : t('errors.saveFailed')
      setError(message || t('errors.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [episodes, onImportComplete, saveProjectEpisodesBatchMutation, t])

  return {
    stage,
    setStage,
    rawContent,
    setRawContent,
    episodes,
    selectedEpisode,
    setSelectedEpisode,
    error,
    saving,
    markerResult,
    showMarkerConfirm,
    deleteConfirm,
    handleAnalyze,
    performAISplit,
    handleMarkerSplit,
    setShowMarkerConfirm,
    setMarkerResult,
    updateEpisodeTitle,
    updateEpisodeSummary,
    updateEpisodeNumber,
    updateEpisodeContent,
    addEpisode,
    openDeleteConfirm,
    closeDeleteConfirm,
    confirmDeleteEpisode,
    handleConfirm,
  }
}
