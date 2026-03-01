import { createScopedLogger } from '@/lib/logging/core'
import COS from 'cos-nodejs-sdk-v5'
import * as fs from 'fs/promises'
import * as path from 'path'
import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'

const cosLogger = createScopedLogger({
  module: 'storage.cos',
})
const _ulogInfo = (...args: unknown[]) => cosLogger.info(...args)
const _ulogWarn = (...args: unknown[]) => cosLogger.warn(...args)
const _ulogError = (...args: unknown[]) => cosLogger.error(...args)

// ==================== 存储类型配置 ====================
// STORAGE_TYPE: 'cos' | 'local'
// - cos: 使用腾讯云COS（需要配置COS_SECRET_ID等）
// - local: 使用本地文件存储（适合内网部署）
const STORAGE_TYPE = process.env.STORAGE_TYPE || 'cos'
const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads'

// 日志标识
export const isLocalStorage = STORAGE_TYPE === 'local'
if (isLocalStorage) {
  _ulogInfo(`[Storage] 使用本地存储模式，目录: ${UPLOAD_DIR}`)
} else {
  _ulogInfo(`[Storage] 使用COS云存储模式`)
}

/** 本地存储时的上传目录绝对路径（仅 isLocalStorage 时有意义） */
export function getLocalUploadDirAbs(): string {
  return path.join(process.cwd(), UPLOAD_DIR)
}

/**
 * 本地存储模式下，根据 storageKey 返回绝对文件路径；非本地模式返回 null。
 * 供 /m/[publicId] 等路由直接读盘，避免对自身 API 发起 fetch 导致 ECONNREFUSED。
 * 调用方需对返回值做路径逃逸检查（确保在 getLocalUploadDirAbs() 下）。
 */
export function getLocalFilePath(key: string): string | null {
  if (!isLocalStorage) return null
  return path.join(process.cwd(), UPLOAD_DIR, key)
}

// COS 超时和重试配置
const COS_TIMEOUT_MS = 60 * 1000  // 60秒超时
const COS_MAX_RETRIES = 3         // 最大重试次数
const COS_RETRY_DELAY_BASE_MS = 2000  // 重试延迟基数
// 统一签名 URL 过期时间：24小时
const SIGNED_URL_EXPIRES_SECONDS = 24 * 60 * 60

type UnknownRecord = Record<string, unknown>

interface AppLike {
  imageUrls: string | null
  descriptions: string | unknown[] | null
  imageUrl: string | null
  [key: string]: unknown
}

interface CharacterLike {
  appearances?: AppLike[]
  customVoiceUrl?: string | null
  [key: string]: unknown
}

interface LocationImageLike {
  imageUrl: string | null
  [key: string]: unknown
}

interface LocationLike {
  images?: LocationImageLike[]
  [key: string]: unknown
}

interface ShotLike {
  imageUrl: string | null
  videoUrl: string | null
  [key: string]: unknown
}

interface PanelLike {
  imageUrl: string | null
  sketchImageUrl: string | null
  videoUrl: string | null
  lipSyncVideoUrl: string | null
  candidateImages: string | null
  panelImageHistory?: string | null
  imageHistory?: string | null
  [key: string]: unknown
}

interface StoryboardLike {
  panels?: PanelLike[]
  imageHistory?: string | null
  storyboardImageUrl: string | null
  [key: string]: unknown
}

interface ProjectLike {
  audioUrl?: string | null
  characters?: CharacterLike[]
  locations?: LocationLike[]
  shots?: ShotLike[]
  storyboards?: StoryboardLike[]
  [key: string]: unknown
}

function extractErrorInfo(error: unknown): { name?: string; code?: string; message: string; cause?: unknown } {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown; cause?: unknown }
    return {
      name: error.name,
      code: typeof withCode.code === 'string' ? withCode.code : undefined,
      message: error.message,
      cause: withCode.cause,
    }
  }
  if (error && typeof error === 'object') {
    const record = error as UnknownRecord
    return {
      name: typeof record.name === 'string' ? record.name : undefined,
      code: typeof record.code === 'string' ? record.code : undefined,
      message: typeof record.message === 'string' ? record.message : String(error),
      cause: record.cause,
    }
  }
  return { message: String(error) }
}

export function toFetchableUrl(inputUrl: string): string {
  if (inputUrl.startsWith('http://') || inputUrl.startsWith('https://') || inputUrl.startsWith('data:')) {
    return inputUrl
  }
  if (inputUrl.startsWith('/')) {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    return `${baseUrl}${inputUrl}`
  }
  return inputUrl
}

// COS客户端（仅在COS模式下初始化）
let cos: COS | null = null
let BUCKET = ''
let REGION = ''

if (!isLocalStorage) {
  cos = new COS({
    SecretId: process.env.COS_SECRET_ID!,
    SecretKey: process.env.COS_SECRET_KEY!,
    Timeout: COS_TIMEOUT_MS,
  })
  BUCKET = process.env.COS_BUCKET!
  REGION = process.env.COS_REGION!
}

/**
 * 获取COS客户端实例（仅COS模式）
 */
export function getCOSClient() {
  if (isLocalStorage) {
    throw new Error('本地存储模式下不支持获取COS客户端')
  }
  return cos!
}

/**
 * 上传文件到存储（COS或本地文件系统）
 * @param buffer 文件Buffer
 * @param key 文件路径（例如：images/character-xxx.png）
 * @param maxRetries 最大重试次数，默认3次
 * @returns 存储Key
 */
export async function uploadToCOS(buffer: Buffer, key: string, maxRetries: number = COS_MAX_RETRIES): Promise<string> {
  // ==================== 本地存储模式 ====================
  if (isLocalStorage) {
    try {
      const filePath = path.join(UPLOAD_DIR, key)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, buffer)
      _ulogInfo(`[Local上传] 成功: ${key}`)
      return key
    } catch (error: unknown) {
      const errorInfo = extractErrorInfo(error)
      _ulogError(`[Local上传] 失败: ${key}`, errorInfo.message)
      throw new Error(`本地存储上传失败: ${key}`)
    }
  }

  // ==================== COS云存储模式 ====================
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        _ulogInfo(`[COS上传] 第 ${attempt}/${maxRetries} 次尝试上传: ${key}`)
      }

      const result = await new Promise<string>((resolve, reject) => {
        cos!.putObject(
          {
            Bucket: BUCKET,
            Region: REGION,
            Key: key,
            Body: buffer,
            // 不设置ACL，保持私有（默认）
          },
          (err) => {
            if (err) {
              reject(err)
            } else {
              // 返回COS Key（不是完整URL）
              resolve(key)
            }
          }
        )
      })

      if (attempt > 1) {
        _ulogInfo(`[COS上传] 第 ${attempt} 次尝试成功: ${key}`)
      }
      return result

    } catch (error: unknown) {
      const errorInfo = extractErrorInfo(error)
      lastError = error

      // 详细记录错误信息
      const errorDetails = {
        attempt,
        maxRetries,
        key,
        errorCode: errorInfo.code,
        errorMessage: errorInfo.message,
        isTimeoutError: errorInfo.code === 'ETIMEDOUT' || errorInfo.code === 'ESOCKETTIMEDOUT'
      }
      _ulogError(`[COS上传] 第 ${attempt}/${maxRetries} 次尝试失败:`, JSON.stringify(errorDetails, null, 2))

      // 如果不是最后一次尝试，等待后重试
      if (attempt < maxRetries) {
        const delayMs = COS_RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1)  // 指数退避：2s, 4s, 8s
        _ulogInfo(`[COS上传] 等待 ${delayMs / 1000} 秒后重试...`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }

  // 所有重试都失败
  _ulogError(`[COS上传] 所有 ${maxRetries} 次重试都失败: ${key}`)
  throw lastError || new Error(`COS上传失败: ${key}`)
}

/**
 * 删除存储对象（COS或本地文件）
 * @param key 存储Key（例如：images/xxx.png）
 */
export async function deleteCOSObject(key: string): Promise<void> {
  // ==================== 本地存储模式 ====================
  if (isLocalStorage) {
    try {
      const filePath = path.join(UPLOAD_DIR, key)
      await fs.unlink(filePath)
      _ulogInfo(`[Local删除] 成功: ${key}`)
    } catch (error: unknown) {
      const errorInfo = extractErrorInfo(error)
      // 文件不存在时忽略错误
      if (errorInfo.code !== 'ENOENT') {
        _ulogError(`[Local删除] 失败: ${key}`, errorInfo.message)
      }
    }
    return
  }

  // ==================== COS云存储模式 ====================
  return new Promise((resolve, reject) => {
    cos!.deleteObject(
      {
        Bucket: BUCKET,
        Region: REGION,
        Key: key,
      },
      (err) => {
        if (err) {
          _ulogError('COS delete error:', err)
          reject(err)
        } else {
          resolve()
        }
      }
    )
  })
}

/**
 * 批量删除存储对象（COS或本地文件）
 * @param keys 存储Key数组
 * @returns 删除结果统计
 */
export async function deleteCOSObjects(keys: string[]): Promise<{ success: number; failed: number }> {
  if (keys.length === 0) return { success: 0, failed: 0 }

  // 过滤掉空值和无效的 key
  const validKeys = keys.filter(key => key && typeof key === 'string' && key.trim().length > 0)
  if (validKeys.length === 0) return { success: 0, failed: 0 }

  // ==================== 本地存储模式 ====================
  if (isLocalStorage) {
    _ulogInfo(`[Local] 准备删除 ${validKeys.length} 个文件`)
    let success = 0
    let failed = 0

    for (const key of validKeys) {
      try {
        const filePath = path.join(UPLOAD_DIR, key)
        await fs.unlink(filePath)
        success++
      } catch (error: unknown) {
        const errorInfo = extractErrorInfo(error)
        if (errorInfo.code !== 'ENOENT') {
          failed++
        } else {
          success++ // 文件不存在也算成功
        }
      }
    }

    _ulogInfo(`[Local] 删除完成: 成功 ${success}, 失败 ${failed}`)
    return { success, failed }
  }

  // ==================== COS云存储模式 ====================
  _ulogInfo(`[COS] 准备删除 ${validKeys.length} 个文件`)

  // COS 批量删除 API 每次最多 1000 个
  const batchSize = 1000
  let success = 0
  let failed = 0

  for (let i = 0; i < validKeys.length; i += batchSize) {
    const batch = validKeys.slice(i, i + batchSize)

    try {
      await new Promise<void>((resolve) => {
        cos!.deleteMultipleObject(
          {
            Bucket: BUCKET,
            Region: REGION,
            Objects: batch.map(key => ({ Key: key })),
          },
          (err, data) => {
            if (err) {
              _ulogError('[COS] 批量删除错误:', err)
              failed += batch.length
              resolve() // 不中断，继续处理其他批次
            } else {
              // 统计成功和失败
              const deletedCount = data.Deleted?.length || 0
              const errorCount = data.Error?.length || 0
              success += deletedCount
              failed += errorCount

              if (errorCount > 0) {
                _ulogWarn('[COS] 部分文件删除失败:', data.Error)
              }
              resolve()
            }
          }
        )
      })
    } catch (error) {
      _ulogError('[COS] 批量删除异常:', error)
      failed += batch.length
    }
  }

  _ulogInfo(`[COS] 删除完成: 成功 ${success}, 失败 ${failed}`)
  return { success, failed }
}

/**
 * 从URL或COS Key中提取COS Key
 * 支持完整URL和纯Key两种格式
 */
export function extractCOSKey(urlOrKey: string | null | undefined): string | null {
  if (!urlOrKey) return null

  // 🔧 本地模式修复：处理 /api/files/xxx 格式的本地 URL
  if (urlOrKey.startsWith('/api/files/')) {
    return decodeURIComponent(urlOrKey.replace('/api/files/', ''))
  }

  // 如果已经是纯 Key（不包含 http 且不是相对路径），直接返回
  if (!urlOrKey.startsWith('http') && !urlOrKey.startsWith('/')) {
    return urlOrKey
  }

  // 从完整 URL 中提取 Key
  try {
    const url = new URL(urlOrKey)
    // 移除开头的 /
    return url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname
  } catch {
    return null
  }
}

/**
 * 从URL下载图片并上传到COS（带压缩、超时和重试）
 * @param imageUrl 原始图片URL
 * @param key 文件路径
 * @param maxRetries 最大重试次数，默认3次
 * @returns COS Key
 */
export async function downloadAndUploadToCOS(imageUrl: string, key: string, maxRetries: number = COS_MAX_RETRIES): Promise<string> {
  let lastError: unknown = null
  const fetchUrl = toFetchableUrl(imageUrl)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        _ulogInfo(`[图片下载上传] 第 ${attempt}/${maxRetries} 次尝试: ${imageUrl.substring(0, 80)}...`)
      }

      const sharp = (await import('sharp')).default

      // 使用 AbortController 设置超时（60秒）
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), COS_TIMEOUT_MS)

      // 下载图片
      const response = await fetch(fetchUrl, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // 压缩图片（保持原始分辨率，不超过10MB）
      let processedBuffer: Buffer
      let quality = 95 // 初始高质量
      const maxSizeMB = 10
      const maxSizeBytes = maxSizeMB * 1024 * 1024

      // 先尝试高质量压缩
      processedBuffer = await sharp(buffer)
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()

      // 如果超过10MB，逐步降低质量
      while (processedBuffer.length > maxSizeBytes && quality > 60) {
        quality -= 5
        _ulogInfo(`图片大小 ${(processedBuffer.length / 1024 / 1024).toFixed(2)}MB 超过 ${maxSizeMB}MB，降低质量到 ${quality}%`)
        processedBuffer = await sharp(buffer)
          .jpeg({ quality, mozjpeg: true })
          .toBuffer()
      }

      _ulogInfo(`最终图片大小: ${(processedBuffer.length / 1024 / 1024).toFixed(2)}MB, 质量: ${quality}%`)

      // 修改key的扩展名为.jpg
      const jpgKey = key.replace(/\.(png|webp)$/i, '.jpg')

      // 上传到COS（uploadToCOS 已有重试机制）
      return await uploadToCOS(processedBuffer, jpgKey)

    } catch (error: unknown) {
      const errorInfo = extractErrorInfo(error)
      lastError = error

      // 详细记录错误信息
      const errorDetails = {
        attempt,
        maxRetries,
        errorName: errorInfo.name,
        errorMessage: errorInfo.message,
        isAbortError: errorInfo.name === 'AbortError',
        isTimeoutError: errorInfo.name === 'AbortError' || errorInfo.code === 'ETIMEDOUT',
        imageUrl: imageUrl.substring(0, 80) + '...',
        fetchUrl: fetchUrl.substring(0, 80) + '...'
      }
      _ulogError(`[图片下载上传] 第 ${attempt}/${maxRetries} 次尝试失败:`, JSON.stringify(errorDetails, null, 2))

      // 如果不是最后一次尝试，等待后重试
      if (attempt < maxRetries) {
        const delayMs = COS_RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1)
        _ulogInfo(`[图片下载上传] 等待 ${delayMs / 1000} 秒后重试...`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }

  // 所有重试都失败
  _ulogError(`[图片下载上传] 所有 ${maxRetries} 次重试都失败`)
  throw lastError || new Error('Download and upload failed after all retries')
}

/**
 * 下载视频并上传到COS（不进行压缩处理，带重试机制）
 * @param videoUrl 视频URL
 * @param key 文件路径
 * @param maxRetries 最大重试次数，默认3次
 * @returns COS Key
 */
export async function downloadAndUploadVideoToCOS(
  videoUrl: string,
  key: string,
  maxRetries: number = 3,
  requestHeaders?: Record<string, string>,
): Promise<string> {
  let lastError: unknown = null
  const fetchUrl = toFetchableUrl(videoUrl)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      _ulogInfo(`[视频下载] 第 ${attempt}/${maxRetries} 次尝试下载: ${videoUrl.substring(0, 100)}...`)

      // 使用 AbortController 设置超时（5分钟）
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000)

      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; VideoDownloader/1.0)',
          ...(requestHeaders || {}),
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // 获取内容长度用于进度显示
      const contentLength = response.headers.get('content-length')
      _ulogInfo(`[视频下载] 响应状态: ${response.status}, 内容大小: ${contentLength ? (parseInt(contentLength) / 1024 / 1024).toFixed(2) + 'MB' : '未知'}`)

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      _ulogInfo(`[视频下载] 下载完成，视频大小: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`)

      // 直接上传到COS（视频不进行压缩）
      const cosKey = await uploadToCOS(buffer, key)
      _ulogInfo(`[视频上传] 上传到COS成功: ${cosKey}`)
      return cosKey

    } catch (error: unknown) {
      const errorInfo = extractErrorInfo(error)
      lastError = error

      // 详细记录错误信息
      const errorDetails = {
        attempt,
        maxRetries,
        errorName: errorInfo.name,
        errorMessage: errorInfo.message,
        errorCause: errorInfo.cause ? String(errorInfo.cause) : undefined,
        errorCode: errorInfo.code,
        isAbortError: errorInfo.name === 'AbortError',
        isTimeoutError: errorInfo.name === 'AbortError' || errorInfo.message.includes('timeout'),
        isFetchError: errorInfo.message.includes('fetch failed') || errorInfo.name === 'TypeError',
        videoUrl: videoUrl.substring(0, 100) + '...',
        fetchUrl: fetchUrl.substring(0, 100) + '...'
      }

      _ulogError(`[视频下载] 第 ${attempt}/${maxRetries} 次尝试失败:`, JSON.stringify(errorDetails, null, 2))

      // 如果是最后一次尝试，不再重试
      if (attempt === maxRetries) {
        _ulogError(`[视频下载] 已达到最大重试次数 ${maxRetries}，放弃下载`)
        break
      }

      // 计算重试延迟（指数退避：2秒、4秒、8秒...）
      const delayMs = Math.pow(2, attempt) * 1000
      _ulogInfo(`[视频下载] 等待 ${delayMs / 1000} 秒后重试...`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  // 构建详细的错误信息
  const lastErrorInfo = lastError ? extractErrorInfo(lastError) : null
  const errorMessage = lastErrorInfo
    ? `视频下载失败 (重试${maxRetries}次后): ${lastErrorInfo.name || 'Error'} - ${lastErrorInfo.message}${lastErrorInfo.cause ? ` (原因: ${lastErrorInfo.cause})` : ''}`
    : `视频下载失败 (重试${maxRetries}次后): 未知错误`

  throw new Error(errorMessage)
}

/**
 * 生成唯一的文件名
 * @param prefix 前缀（例如：character, location, shot）
 * @param ext 扩展名（例如：png, jpg）
 * @returns 唯一文件名
 */
export function generateUniqueKey(prefix: string, ext: string = 'png'): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `images/${prefix}-${timestamp}-${random}.${ext}`
}

/**
 * 生成文件访问URL（COS签名URL或本地API路径）
 * @param key 文件Key（例如：images/xxx.png）
 * @param expires 兼容旧调用，实际统一固定为24小时
 * @returns 可访问的URL
 */
export function getSignedUrl(key: string, _expires: number = SIGNED_URL_EXPIRES_SECONDS): string {
  void _expires
  // ==================== 本地存储模式 ====================
  if (isLocalStorage) {
    // 返回API路由路径，由文件服务API提供访问
    return `/api/files/${encodeURIComponent(key)}`
  }

  // ==================== COS云存储模式 ====================
  // 统一固定为24小时，忽略外部传入的 expires 值
  const url = cos!.getObjectUrl({
    Bucket: BUCKET,
    Region: REGION,
    Key: key,
    Sign: true,
    Expires: SIGNED_URL_EXPIRES_SECONDS,
  })
  return url
}

/**
 * 批量生成签名URL
 * @param keys COS文件Key数组
 * @param expires 过期时间（秒）
 * @returns 签名URL数组
 */
export function getSignedUrls(keys: string[], _expires: number = SIGNED_URL_EXPIRES_SECONDS): string[] {
  return keys.map(key => getSignedUrl(key, _expires))
}

/**
 * 将COS Key转换为签名URL（处理null值）
 * @param key COS Key或null，也兼容已经是完整URL的情况
 * @param expires 过期时间（秒）
 * @returns 签名URL或null
 */
export function cosKeyToSignedUrl(key: string | null, _expires: number = SIGNED_URL_EXPIRES_SECONDS): string | null {
  if (!key) return null
  // 如果已经是完整URL（旧数据兼容），直接返回
  if (key.startsWith('http://') || key.startsWith('https://')) {
    return key
  }
  return getSignedUrl(key, _expires)
}

/**
 * 为Character对象添加签名URL（新版：使用独立表）
 */
export function addSignedUrlsToCharacter(character: CharacterLike) {
  // 处理独立的 appearances 数组（已经是对象数组，不是 JSON 字符串）
  const appearances = character.appearances?.map((app) => {
    const imageUrls = decodeImageUrlsFromDb(app.imageUrls, 'appearance.imageUrls')
      .map((key) => cosKeyToSignedUrl(key))
      .filter((url): url is string => !!url)

    // 解析 descriptions JSON 字符串
    let descriptions: string[] | null = null
    if (app.descriptions) {
      try {
        descriptions = typeof app.descriptions === 'string' ? JSON.parse(app.descriptions) : app.descriptions
      } catch (error: unknown) {
        _ulogError(`[签名URL] 解析descriptions失败:`, app.descriptions, error)
      }
    }

    const signedImageUrl = cosKeyToSignedUrl(app.imageUrl)

    return {
      ...app,
      imageUrl: signedImageUrl,
      imageUrls,
      descriptions
    }
  }) || []

  return {
    ...character,
    appearances,
    // 处理自定义音色的音频URL
    customVoiceUrl: character.customVoiceUrl ? cosKeyToSignedUrl(character.customVoiceUrl) : null
  }
}

/**
 * 为Location对象添加签名URL（新版：使用独立表）
 */
export function addSignedUrlToLocation(location: LocationLike) {
  // 处理独立的 images 数组（已经是对象数组，不是 JSON 字符串）
  const images = location.images?.map((img) => ({
    ...img,
    imageUrl: cosKeyToSignedUrl(img.imageUrl)
  })) || []

  return {
    ...location,
    images
  }
}

/**
 * 为Shot对象添加签名URL
 */
export function addSignedUrlsToShot(shot: ShotLike) {
  return {
    ...shot,
    imageUrl: cosKeyToSignedUrl(shot.imageUrl),
    videoUrl: cosKeyToSignedUrl(shot.videoUrl),
  }
}

/**
 * 为AssetLibraryCharacter对象添加签名URL
 */
export function addSignedUrlToAssetCharacter(character: { imageUrl: string | null } & UnknownRecord) {
  return {
    ...character,
    imageUrl: cosKeyToSignedUrl(character.imageUrl),
  }
}

/**
 * 为AssetLibraryLocation对象添加签名URL
 */
export function addSignedUrlToAssetLocation(location: { imageUrl: string | null } & UnknownRecord) {
  return {
    ...location,
    imageUrl: cosKeyToSignedUrl(location.imageUrl),
  }
}

/**
 * 为Storyboard对象添加签名URL
 * 仅使用 panel.imageUrl 作为唯一图片来源
 */
export function addSignedUrlsToStoryboard(storyboard: StoryboardLike) {
  // 处理独立的 Panel 记录（Panel 表是唯一数据源）
  let panels: PanelLike[] = []
  if (storyboard.panels && Array.isArray(storyboard.panels)) {
    panels = storyboard.panels.map((dbPanel) => {
      let panelHistoryCount = 0
      const historyField = dbPanel.panelImageHistory || dbPanel.imageHistory
      if (historyField) {
        try {
          const history = JSON.parse(historyField)
          panelHistoryCount = Array.isArray(history) ? history.length : 0
        } catch { }
      }

      // panel.imageUrl 为唯一数据源
      const imageKey = dbPanel.imageUrl
      let finalImageUrl: string | null = null
      if (imageKey) {
        finalImageUrl = cosKeyToSignedUrl(imageKey)
      }

      // 🔥 处理candidateImages：转换COS key为签名URL，保留PENDING项不变
      let signedCandidateImages = dbPanel.candidateImages
      if (signedCandidateImages) {
        try {
          const candidates = JSON.parse(signedCandidateImages)
          if (Array.isArray(candidates)) {
            const signedCandidates = candidates.map((candidate) => {
              if (typeof candidate !== 'string') return candidate
              // PENDING开头的保持不变（还在生成中）
              if (candidate.startsWith('PENDING:')) return candidate
              // 已完成的转换为签名URL
              return cosKeyToSignedUrl(candidate) || candidate
            })
            signedCandidateImages = JSON.stringify(signedCandidates)
          }
        } catch { }
      }

      return {
        ...dbPanel,
        imageUrl: finalImageUrl,
        // 两步分镜流程：黑白线稿URL
        sketchImageUrl: cosKeyToSignedUrl(dbPanel.sketchImageUrl),
        videoUrl: dbPanel.videoUrl && !dbPanel.videoUrl.startsWith('http')
          ? getSignedUrl(dbPanel.videoUrl, 7200)
          : dbPanel.videoUrl,
        // 口型同步视频URL
        lipSyncVideoUrl: dbPanel.lipSyncVideoUrl && !dbPanel.lipSyncVideoUrl.startsWith('http')
          ? getSignedUrl(dbPanel.lipSyncVideoUrl, 7200)
          : dbPanel.lipSyncVideoUrl,
        // 🔥 候选图签名URL
        candidateImages: signedCandidateImages,
        historyCount: panelHistoryCount
      }
    })
  }

  // 计算整组分镜的历史版本数量
  let historyCount = 0
  if (storyboard.imageHistory) {
    try {
      const history = JSON.parse(storyboard.imageHistory)
      historyCount = Array.isArray(history) ? history.length : 0
    } catch { }
  }

  return {
    ...storyboard,
    storyboardImageUrl: cosKeyToSignedUrl(storyboard.storyboardImageUrl),
    panels,
    historyCount
  }
}

/**
 * 为Project对象的所有资源添加签名URL
 */
export function addSignedUrlsToProject(project: ProjectLike) {
  return {
    ...project,
    // 处理audioUrl字段(用于novel-promotion的TTS音频)
    audioUrl: project.audioUrl ? getSignedUrl(project.audioUrl) : project.audioUrl,
    characters: project.characters?.map(addSignedUrlsToCharacter) || [],
    locations: project.locations?.map(addSignedUrlToLocation) || [],
    shots: project.shots?.map(addSignedUrlsToShot) || [],
    storyboards: project.storyboards?.map(addSignedUrlsToStoryboard) || [],
  }
}

/**
 * 将COS Key或URL转换为Base64格式
 * @param keyOrUrl COS Key（例如：images/xxx.png）或完整URL
 * @returns Base64格式字符串（data:image/png;base64,...）
 */
export async function imageUrlToBase64(keyOrUrl: string): Promise<string> {
  try {
    return await normalizeToBase64ForGeneration(keyOrUrl)
  } catch (error) {
    _ulogError(`Failed to convert to Base64: ${keyOrUrl}`, error)
    throw error
  }
}
