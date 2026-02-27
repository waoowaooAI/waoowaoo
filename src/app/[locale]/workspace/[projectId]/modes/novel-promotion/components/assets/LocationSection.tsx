'use client'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

/**
 * LocationSection - 场景资产区块组件
 * 从 AssetsStage.tsx 提取，负责场景列表的展示和操作
 * 
 * 🔥 V6.5 重构：内部直接订阅 useProjectAssets，消除 props drilling
 */

import { Location } from '@/types/project'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'
import LocationCard from './LocationCard'
import { AppIcon } from '@/components/ui/icons'

interface LocationSectionProps {
    // 🔥 V6.5 删除：locations prop - 现在内部直接订阅
    projectId: string
    activeTaskKeys: Set<string>
    onClearTaskKey: (key: string) => void
    // 回调函数
    onAddLocation: () => void
    onDeleteLocation: (locationId: string) => void
    onEditLocation: (location: Location) => void
    // 🔥 V6.6 重构：重命名为 handleGenerateImage
    handleGenerateImage: (type: 'character' | 'location', id: string, appearanceId?: string) => void
    onSelectImage: (locationId: string, imageIndex: number | null) => void
    onConfirmSelection: (locationId: string) => void
    onRegenerateSingle: (locationId: string, imageIndex: number) => void
    onRegenerateGroup: (locationId: string) => void
    onUndo: (locationId: string) => void
    onImageClick: (imageUrl: string) => void
    onImageEdit: (locationId: string, imageIndex: number, locationName: string) => void
    onCopyFromGlobal: (locationId: string) => void  // 🆕 从资产中心复制
}

export default function LocationSection({
    // 🔥 V6.5 删除：locations prop - 现在内部直接订阅
    projectId,
    activeTaskKeys,
    onClearTaskKey,
    onAddLocation,
    onDeleteLocation,
    onEditLocation,
    handleGenerateImage,
    onSelectImage,
    onConfirmSelection,
    onRegenerateSingle,
    onRegenerateGroup,
    onUndo,
    onImageClick,
    onImageEdit,
    onCopyFromGlobal
}: LocationSectionProps) {
    const t = useTranslations('assets')

    // 🔥 V6.5 重构：直接订阅缓存，消除 props drilling
    const { data: assets } = useProjectAssets(projectId)
    const locations: Location[] = assets?.locations ?? []

    return (
        <div className="glass-surface p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]">
                        <AppIcon name="imageLandscape" className="h-5 w-5" />
                    </span>
                    <h3 className="text-lg font-bold text-[var(--glass-text-primary)]">{t("stage.locationAssets")}</h3>
                    <span className="text-sm text-[var(--glass-text-tertiary)] bg-[var(--glass-bg-muted)]/50 px-2 py-1 rounded-lg">
                        {t("stage.locationCounts", { count: locations.length })}
                    </span>
                </div>
                <button
                    onClick={onAddLocation}
                    className="glass-btn-base glass-btn-primary flex items-center gap-2 px-4 py-2 font-medium"
                >
                    + {t("location.add")}
                </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-6 gap-6">
                {locations.map(location => (
                    <LocationCard
                        key={location.id}
                        location={location}
                        onEdit={() => onEditLocation(location)}
                        onDelete={() => onDeleteLocation(location.id)}
                        onRegenerate={() => {
                            // 获取有效图片数量
                            const validImages = location.images?.filter(img => img.imageUrl) || []

                            _ulogInfo('[LocationSection] 重新生成判断:', {
                                locationName: location.name,
                                images: location.images,
                                validImages,
                                validImageCount: validImages.length
                            })

                            // 单图：重新生成单张
                            if (validImages.length === 1) {
                                const imageIndex = validImages[0].imageIndex
                                _ulogInfo('[LocationSection] 调用单张重新生成, imageIndex:', imageIndex)
                                onRegenerateSingle(location.id, imageIndex)
                            }
                            // 多图或无图：重新生成整组
                            else {
                                _ulogInfo('[LocationSection] 调用整组重新生成')
                                onRegenerateGroup(location.id)
                            }
                        }}
                        onGenerate={() => handleGenerateImage('location', location.id)}
                        onUndo={() => onUndo(location.id)}
                        onImageClick={onImageClick}
                        onSelectImage={onSelectImage}
                        onImageEdit={(locId, imgIdx) => onImageEdit(locId, imgIdx, location.name)}
                        onCopyFromGlobal={() => onCopyFromGlobal(location.id)}
                        activeTaskKeys={activeTaskKeys}
                        onClearTaskKey={onClearTaskKey}
                        projectId={projectId}
                        onConfirmSelection={onConfirmSelection}
                    />
                ))}
            </div>
        </div>
    )
}
