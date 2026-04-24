import { logInfo as _ulogInfo, logWarn as _ulogWarn } from '@/lib/logging/core'
/**
 * 🎯 集中式视频分辨率适配器
 * 
 * 职责：
 * - 将用户的通用分辨率配置（720p/1080p/4K等）转换为各模型支持的特定格式
 * - 集中管理所有模型的分辨率映射规则
 * - 简化维护，一目了然
 * 
 * 使用示例：
 * ```typescript
 * const resolution = adaptVideoResolution('minimax', '1080p')
 * // 返回: '1080P'
 * ```
 */

// ============================================================
// 类型定义
// ============================================================

export type VideoProvider = 'minimax' | 'fal' | 'ark' | 'vidu'

// ============================================================
// 分辨率适配规则
// ============================================================

/**
 * 各模型的分辨率适配规则
 * key: provider名称
 * value: 适配函数
 */
const RESOLUTION_ADAPTERS: Record<VideoProvider, (input: string) => string> = {
    /**
     * MiniMax (海螺)
     * 支持：768P, 1080P
     * 
     * 映射规则：
     * - 720p/768p → 768P（标清）
     * - 1080p及以上 → 1080P（高清，最高支持）
     */
    minimax: (input: string): string => {
        const normalized = input.toLowerCase().replace(/[^0-9kp]/g, '')

        // 720p 系列 → 768P
        if (normalized.includes('720') || normalized.includes('768')) {
            return '768P'
        }

        // 1080p 及以上全部映射到 1080P（MiniMax最高支持）
        return '1080P'
    },

    /**
     * FAL 模型
     * 支持：720p, 1080p, 1440p, 4K
     * 
     * FAL直接支持标准分辨率，不需要转换，只做格式统一
     */
    fal: (input: string): string => {
        const normalized = input.toLowerCase()

        if (normalized.includes('720')) return '720p'
        if (normalized.includes('1080')) return '1080p'
        if (normalized.includes('1440') || normalized.includes('2k')) return '1440p'
        if (normalized.includes('4k')) return '4K'

        return '1080p' // 默认1080p
    },

    /**
     * Ark 模型 (Seedance等)
     * 支持：720p, 1080p
     * 
     * 映射规则：
     * - 720p及以下 → 720p
     * - 1080p及以上 → 1080p
     */
    ark: (input: string): string => {
        const normalized = input.toLowerCase()

        if (normalized.includes('720')) return '720p'
        return '1080p' // 默认和高于1080p的都映射到1080p
    },

    /**
     * Vidu 模型（示例，根据实际情况调整）
     * 支持：720p, 1080p, 2K
     * 
     * 映射规则：
     * - 720p → 720p
     * - 1080p → 1080p
     * - 1440p/2K/4K → 2K
     */
    vidu: (input: string): string => {
        const normalized = input.toLowerCase()

        if (normalized.includes('720')) return '720p'
        if (normalized.includes('1440') || normalized.includes('2k') || normalized.includes('4k')) {
            return '2K'
        }
        return '1080p' // 默认1080p
    }
}

// ============================================================
// 公共API
// ============================================================

/**
 * 适配视频分辨率
 * 
 * @param provider - 模型提供商
 * @param inputResolution - 用户配置的分辨率（如 '720p', '1080p', '4K'）
 * @returns 适配后的分辨率（符合该模型的规格）
 * 
 * @example
 * adaptVideoResolution('minimax', '720p')  // 返回: '768P'
 * adaptVideoResolution('minimax', '1080p') // 返回: '1080P'
 * adaptVideoResolution('fal', '1080p')     // 返回: '1080p'
 */
export function adaptVideoResolution(
    provider: string,
    inputResolution: string
): string {
    const adapter = RESOLUTION_ADAPTERS[provider as VideoProvider]

    if (!adapter) {
        _ulogWarn(`[分辨率适配] 未知provider: ${provider}，使用原始值: ${inputResolution}`)
        return inputResolution
    }

    const adapted = adapter(inputResolution)
    _ulogInfo(`[分辨率适配] provider=${provider}, 输入=${inputResolution} → 适配=${adapted}`)
    return adapted
}

/**
 * 获取模型支持的分辨率列表（用于UI展示）
 * 
 * @param provider - 模型提供商
 * @returns 支持的分辨率列表
 */
export function getSupportedResolutions(provider: string): string[] {
    const resolutionMap: Record<VideoProvider, string[]> = {
        minimax: ['768P', '1080P'],
        fal: ['720p', '1080p', '1440p', '4K'],
        ark: ['720p', '1080p'],
        vidu: ['720p', '1080p', '2K']
    }

    return resolutionMap[provider as VideoProvider] || ['720p', '1080p']
}

/**
 * 检查分辨率是否被支持（避免不必要的适配）
 * 
 * @param provider - 模型提供商
 * @param resolution - 分辨率
 * @returns 是否直接支持
 */
export function isResolutionSupported(provider: string, resolution: string): boolean {
    const supported = getSupportedResolutions(provider)
    return supported.includes(resolution)
}
