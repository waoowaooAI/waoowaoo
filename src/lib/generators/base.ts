import { logWarn as _ulogWarn } from '@/lib/logging/core'
/**
 * 生成器基础接口和类型定义
 * 
 * 策略模式核心：所有生成器实现统一接口
 */

// ============================================================
// 通用类型
// ============================================================

export interface GenerateOptions {
    aspectRatio?: string      // 宽高比，如 '16:9', '3:4'
    resolution?: string        // 分辨率，如 '2K', '4K'
    outputFormat?: string      // 输出格式，如 'png', 'jpg'
    duration?: number          // 视频时长（秒）
    fps?: number              // 帧率
    [key: string]: unknown        // 其他厂商特定参数
}

export interface GenerateResult {
    success: boolean
    imageUrl?: string         // 图片 URL
    imageBase64?: string      // 图片 base64
    videoUrl?: string         // 视频 URL
    audioUrl?: string         // 音频 URL
    error?: string           // 错误信息
    requestId?: string       // 异步任务 ID（原始格式，向后兼容）
    async?: boolean          // 是否为异步任务
    endpoint?: string        // 异步任务端点（向后兼容）
    externalId?: string      // 🔥 标准格式的异步任务标识符（如 FAL:IMAGE:fal-ai/nano-banana-pro:requestId）
}

// ============================================================
// 图片生成器接口
// ============================================================

export interface ImageGenerateParams {
    userId: string
    prompt: string
    referenceImages?: string[]  // 参考图片 URLs 或 base64
    options?: GenerateOptions
}

export interface ImageGenerator {
    /**
     * 生成图片
     */
    generate(params: ImageGenerateParams): Promise<GenerateResult>
}

// ============================================================
// 视频生成器接口
// ============================================================

export interface VideoGenerateParams {
    userId: string
    imageUrl: string           // 起始图片
    prompt?: string            // 提示词（可选）
    options?: GenerateOptions
}

export interface VideoGenerator {
    /**
     * 生成视频
     */
    generate(params: VideoGenerateParams): Promise<GenerateResult>
}

// ============================================================
// 语音生成器接口
// ============================================================

export interface AudioGenerateParams {
    userId: string
    text: string              // 文本内容
    voice?: string            // 音色
    rate?: number             // 语速
    options?: GenerateOptions
}

export interface AudioGenerator {
    /**
     * 生成语音
     */
    generate(params: AudioGenerateParams): Promise<GenerateResult>
}

// ============================================================
// 基类（可选，提供通用功能）
// ============================================================

export abstract class BaseImageGenerator implements ImageGenerator {
    /**
     * 生成图片（带重试）
     */
    async generate(params: ImageGenerateParams): Promise<GenerateResult> {
        const maxRetries = 2
        let lastError: unknown = null

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.doGenerate(params)
            } catch (error: unknown) {
                lastError = error
                const message = error instanceof Error ? error.message : String(error)
                _ulogWarn(`[Generator] 尝试 ${attempt}/${maxRetries} 失败: ${message}`)

                // 最后一次尝试，直接抛出
                if (attempt === maxRetries) {
                    break
                }

                // 等待后重试
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
            }
        }

        return {
            success: false,
            error: lastError instanceof Error ? lastError.message : '生成失败'
        }
    }

    /**
     * 子类实现具体生成逻辑
     */
    protected abstract doGenerate(params: ImageGenerateParams): Promise<GenerateResult>
}

export abstract class BaseVideoGenerator implements VideoGenerator {
    async generate(params: VideoGenerateParams): Promise<GenerateResult> {
        const maxRetries = 2
        let lastError: unknown = null

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.doGenerate(params)
            } catch (error: unknown) {
                lastError = error
                const message = error instanceof Error ? error.message : String(error)
                _ulogWarn(`[Video Generator] 尝试 ${attempt}/${maxRetries} 失败: ${message}`)
                if (attempt === maxRetries) break
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
            }
        }

        return {
            success: false,
            error: lastError instanceof Error ? lastError.message : '视频生成失败'
        }
    }

    protected abstract doGenerate(params: VideoGenerateParams): Promise<GenerateResult>
}

export abstract class BaseAudioGenerator implements AudioGenerator {
    async generate(params: AudioGenerateParams): Promise<GenerateResult> {
        try {
            return await this.doGenerate(params)
        } catch (error: unknown) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '语音生成失败'
            }
        }
    }

    protected abstract doGenerate(params: AudioGenerateParams): Promise<GenerateResult>
}
