'use client'

import { useState, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
    useDesignAssetHubVoice,
    useSaveDesignedAssetHubVoice,
    useUploadAssetHubVoice,
} from '@/lib/query/hooks'
import { resolveTaskPresentationState } from '@/lib/task/presentation'

export interface VoiceCreationModalShellProps {
    isOpen: boolean
    folderId: string | null
    onClose: () => void
    onSuccess: () => void
    /** 预填充的音色名称（如发言人名字） */
    initialVoiceName?: string
}

interface GeneratedVoice {
    voiceId: string
    audioBase64: string
    audioUrl: string
}

type CreationMode = 'design' | 'upload'

// 声音风格预设
const VOICE_PRESET_KEYS = [
    'maleBroadcaster',
    'gentleFemale',
    'matureMale',
    'livelyFemale',
    'intellectualFemale',
    'narrator'
] as const

export function useVoiceCreation({ isOpen, folderId, onClose, onSuccess, initialVoiceName }: VoiceCreationModalShellProps) {
    const t = useTranslations('common')
    const tHub = useTranslations('assetHub')
    const tv = useTranslations('voice.voiceDesign')
    const tvCreate = useTranslations('voice.voiceCreate')

    // 创建模式：设计 or 上传
    const [mode, setMode] = useState<CreationMode>('design')

    // 设计模式状态
    const [voiceName, setVoiceName] = useState(initialVoiceName ?? '')
    const [voicePrompt, setVoicePrompt] = useState('')
    const [previewText, setPreviewText] = useState('')
    const [isVoiceCreationSubmitting, setIsVoiceCreationSubmitting] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [generatedVoices, setGeneratedVoices] = useState<GeneratedVoice[]>([])
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const [playingIndex, setPlayingIndex] = useState<number | null>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const voiceCreationSubmittingState = isVoiceCreationSubmitting
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'audio',
            hasOutput: false,
        })
        : null

    // 上传模式状态
    const [uploadFile, setUploadFile] = useState<File | null>(null)
    const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const uploadSubmittingState = isUploading
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'audio',
            hasOutput: false,
        })
        : null
    const designVoiceMutation = useDesignAssetHubVoice()
    const saveDesignedMutation = useSaveDesignedAssetHubVoice()
    const uploadVoiceMutation = useUploadAssetHubVoice()

    // 生成音色
    const handleGenerate = async () => {
        if (!voicePrompt.trim()) {
            setError(tv('pleaseSelectStyle'))
            return
        }

        setIsVoiceCreationSubmitting(true)
        setError(null)
        setGeneratedVoices([])
        setSelectedIndex(null)

        try {
            const voices: GeneratedVoice[] = []
            const actualPreviewText = previewText.trim() || tv('defaultPreviewText')

            for (let i = 0; i < 3; i++) {
                const safeName = `voice_${Date.now().toString(36)}_${i + 1}`.slice(0, 16)

                const data = await designVoiceMutation.mutateAsync({
                    voicePrompt: voicePrompt.trim(),
                    previewText: actualPreviewText,
                    preferredName: safeName,
                    language: 'zh'
                })

                if (data.audioBase64) {
                    if (typeof data.voiceId !== 'string' || data.voiceId.length === 0) {
                        throw new Error('VOICE_DESIGN_INVALID_RESPONSE: missing voiceId')
                    }
                    voices.push({
                        voiceId: data.voiceId,
                        audioBase64: data.audioBase64,
                        audioUrl: `data:audio/wav;base64,${data.audioBase64}`
                    })
                }
            }

            if (voices.length === 0) {
                throw new Error(tv('noVoiceGenerated'))
            }

            setGeneratedVoices(voices)
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error'
            const status = (err as Error & { status?: number }).status
            if (status === 402) {
                alert(t('insufficientBalance') + '\n\n' + t('insufficientBalanceDetail'))
            } else if (errMsg !== 'INSUFFICIENT_BALANCE') {
                setError(errMsg || tv('generationError'))
            }
        } finally {
            setIsVoiceCreationSubmitting(false)
        }
    }

    // 播放音色（支持暂停切换）
    const handlePlayVoice = (index: number) => {
        // 点击正在播放的音色 → 暂停
        if (playingIndex === index && audioRef.current) {
            audioRef.current.pause()
            setPlayingIndex(null)
            return
        }
        // 停止当前播放
        if (audioRef.current) {
            audioRef.current.pause()
        }
        setPlayingIndex(index)
        const audio = new Audio(generatedVoices[index].audioUrl)
        audioRef.current = audio
        audio.onended = () => setPlayingIndex(null)
        audio.onerror = () => setPlayingIndex(null)
        void audio.play()
    }

    // 保存音色到音色库（设计模式）
    const handleSaveDesigned = async () => {
        if (selectedIndex === null || !generatedVoices[selectedIndex]) return
        if (!voiceName.trim()) {
            setError(tHub('voiceNameRequired'))
            return
        }

        setIsSaving(true)
        setError(null)

        try {
            const voice = generatedVoices[selectedIndex]

            await saveDesignedMutation.mutateAsync({
                voiceId: voice.voiceId,
                voiceBase64: voice.audioBase64,
                voiceName: voiceName.trim(),
                folderId,
                voicePrompt: voicePrompt.trim()
            })

            onSuccess()
            handleClose()
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : tHub('saveVoiceFailed')
            setError(errMsg)
        } finally {
            setIsSaving(false)
        }
    }

    // 处理文件选择
    const handleFileSelect = useCallback((file: File) => {
        // 验证文件类型（仅音频）
        const audioTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a', 'audio/aac']
        const isValid = audioTypes.includes(file.type) || file.name.match(/\.(mp3|wav|ogg|m4a|aac)$/i)

        if (!isValid) {
            setError(tvCreate('invalidFileType'))
            return
        }

        // 验证文件大小（最大 50MB）
        if (file.size > 50 * 1024 * 1024) {
            setError(tvCreate('fileTooLarge'))
            return
        }

        setUploadFile(file)
        setError(null)

        // 创建预览 URL
        const url = URL.createObjectURL(file)
        setUploadPreviewUrl(url)

        // 自动填充名称（如果为空）
        if (!voiceName.trim()) {
            const baseName = file.name.replace(/\.[^/.]+$/, '') // 移除扩展名
            setVoiceName(baseName)
        }
    }, [voiceName, tvCreate])

    // 处理拖放
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) {
            handleFileSelect(file)
        }
    }, [handleFileSelect])

    // 播放上传的音频
    const handlePlayUpload = () => {
        if (!uploadPreviewUrl) return
        if (audioRef.current) {
            audioRef.current.pause()
        }
        const audio = new Audio(uploadPreviewUrl)
        audioRef.current = audio
        audio.play()
    }

    // 上传文件保存
    const handleSaveUploaded = async () => {
        if (!uploadFile) return
        if (!voiceName.trim()) {
            setError(tHub('voiceNameRequired'))
            return
        }

        setIsUploading(true)
        setError(null)

        try {
            await uploadVoiceMutation.mutateAsync({
                uploadFile,
                voiceName: voiceName.trim(),
                folderId
            })

            onSuccess()
            handleClose()
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : tvCreate('uploadFailed')
            setError(errMsg)
        } finally {
            setIsUploading(false)
        }
    }

    // 关闭弹窗
    const handleClose = () => {
        setMode('design')
        setVoiceName(initialVoiceName ?? '')
        setVoicePrompt('')
        setPreviewText('')
        setError(null)
        setGeneratedVoices([])
        setSelectedIndex(null)
        setPlayingIndex(null)
        setUploadFile(null)
        if (uploadPreviewUrl) {
            URL.revokeObjectURL(uploadPreviewUrl)
        }
        setUploadPreviewUrl(null)
        setIsUploading(false)
        if (audioRef.current) {
            audioRef.current.pause()
        }
        onClose()
    }

    // 切换模式
    const handleModeChange = (newMode: CreationMode) => {
        setMode(newMode)
        setError(null)
        // 清理状态
        setGeneratedVoices([])
        setSelectedIndex(null)
        setUploadFile(null)
        if (uploadPreviewUrl) {
            URL.revokeObjectURL(uploadPreviewUrl)
        }
        setUploadPreviewUrl(null)
    }

    return {
        isOpen,
        mode,
        voiceName,
        voicePrompt,
        previewText,
        isVoiceCreationSubmitting,
        isSaving,
        error,
        generatedVoices,
        selectedIndex,
        playingIndex,
        uploadFile,
        uploadPreviewUrl,
        isUploading,
        isDragging,
        fileInputRef,
        voiceCreationSubmittingState,
        uploadSubmittingState,
        t,
        tHub,
        tv,
        tvCreate,
        VOICE_PRESET_KEYS,
        setMode,
        setVoiceName,
        setVoicePrompt,
        setPreviewText,
        setError,
        setGeneratedVoices,
        setSelectedIndex,
        setUploadFile,
        setUploadPreviewUrl,
        setIsDragging,
        handleGenerate,
        handlePlayVoice,
        handleSaveDesigned,
        handleFileSelect,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        handlePlayUpload,
        handleSaveUploaded,
        handleClose,
        handleModeChange,
    }
}

export type VoiceCreationRuntime = ReturnType<typeof useVoiceCreation>
