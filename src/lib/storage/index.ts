import { createScopedLogger } from '@/lib/logging/core'
import { createStorageProvider } from '@/lib/storage/factory'
import type { DeleteObjectsResult, StorageProvider } from '@/lib/storage/types'
import { DEFAULT_SIGNED_URL_EXPIRES_SECONDS, withRetry } from '@/lib/storage/utils'

const storageLogger = createScopedLogger({
  module: 'storage.provider',
})

const UPLOAD_MAX_RETRIES = 3
const RETRY_DELAY_BASE_MS = 2000

let providerSingleton: StorageProvider | null = null

export function getStorageProvider(): StorageProvider {
  if (!providerSingleton) {
    providerSingleton = createStorageProvider()
    storageLogger.info(`[Storage] provider initialized: ${providerSingleton.kind}`)
  }
  return providerSingleton
}

export function getStorageType(): string {
  return getStorageProvider().kind
}

export function toFetchableUrl(inputUrl: string): string {
  return getStorageProvider().toFetchableUrl(inputUrl)
}

export function generateUniqueKey(prefix: string, ext: string = 'png'): string {
  return getStorageProvider().generateUniqueKey({ prefix, ext })
}

export async function uploadObject(
  body: Buffer,
  key: string,
  maxRetries: number = UPLOAD_MAX_RETRIES,
  contentType?: string,
): Promise<string> {
  const provider = getStorageProvider()

  const result = await withRetry(
    async () => {
      return await provider.uploadObject({ key, body, contentType })
    },
    maxRetries,
    RETRY_DELAY_BASE_MS,
  )

  return result.key
}

export async function deleteObject(key: string): Promise<void> {
  await getStorageProvider().deleteObject(key)
}

export async function deleteObjects(keys: string[]): Promise<DeleteObjectsResult> {
  return await getStorageProvider().deleteObjects(keys)
}

export function extractStorageKey(input: string | null | undefined): string | null {
  return getStorageProvider().extractStorageKey(input)
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  return await getStorageProvider().getObjectBuffer(key)
}

export async function getSignedObjectUrl(key: string, expiresInSeconds: number = DEFAULT_SIGNED_URL_EXPIRES_SECONDS): Promise<string> {
  return await getStorageProvider().getSignedObjectUrl({
    key,
    expiresInSeconds,
  })
}

export function getSignedUrl(key: string, expiresInSeconds: number = DEFAULT_SIGNED_URL_EXPIRES_SECONDS): string {
  const provider = getStorageProvider()
  if (provider.kind === 'local') {
    return `/api/files/${encodeURIComponent(key)}`
  }

  return `/api/storage/sign?key=${encodeURIComponent(key)}&expires=${encodeURIComponent(String(expiresInSeconds))}`
}

export function getSignedUrls(keys: string[], expiresInSeconds: number = DEFAULT_SIGNED_URL_EXPIRES_SECONDS): string[] {
  return keys.map((key) => getSignedUrl(key, expiresInSeconds))
}

export async function downloadAndUploadImage(
  imageUrl: string,
  key: string,
  maxRetries: number = UPLOAD_MAX_RETRIES,
): Promise<string> {
  const sharp = (await import('sharp')).default

  return await withRetry(async () => {
    const response = await fetch(toFetchableUrl(imageUrl))
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    let processed = await sharp(buffer).jpeg({ quality: 95, mozjpeg: true }).toBuffer()
    let quality = 95
    const maxSizeBytes = 10 * 1024 * 1024

    while (processed.length > maxSizeBytes && quality > 60) {
      quality -= 5
      processed = await sharp(buffer).jpeg({ quality, mozjpeg: true }).toBuffer()
    }

    const jpgKey = key.replace(/\.(png|webp)$/i, '.jpg')
    return await uploadObject(processed, jpgKey, 1, 'image/jpeg')
  }, maxRetries, RETRY_DELAY_BASE_MS)
}

export async function downloadAndUploadVideo(
  videoUrl: string,
  key: string,
  maxRetries: number = UPLOAD_MAX_RETRIES,
  requestHeaders?: Record<string, string>,
): Promise<string> {
  return await withRetry(async () => {
    const response = await fetch(toFetchableUrl(videoUrl), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VideoDownloader/1.0)',
        ...(requestHeaders || {}),
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status} ${response.statusText}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    return await uploadObject(buffer, key, 1)
  }, maxRetries, RETRY_DELAY_BASE_MS)
}

export * from './signed-urls'
