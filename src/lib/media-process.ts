import { downloadAndUploadVideo, generateUniqueKey, toFetchableUrl, uploadObject } from '@/lib/storage'

export interface ProcessMediaOptions {
  source: string | Buffer
  type: 'image' | 'video' | 'audio'
  keyPrefix: string
  targetId: string
  downloadHeaders?: Record<string, string>
}

/**
 * 处理媒体结果：下载 -> 上传 COS，返回 COS key。
 */
export async function processMediaResult(options: ProcessMediaOptions): Promise<string> {
  const { source, type, keyPrefix, targetId, downloadHeaders } = options
  const ext = type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : 'jpg'
  const key = generateUniqueKey(`${keyPrefix}-${targetId}`, ext)

  if (typeof source === 'string') {
    if (source.startsWith('data:')) {
      const base64Start = source.indexOf(';base64,')
      if (base64Start === -1) throw new Error('无法解析 data: URL')
      const base64Data = source.substring(base64Start + 8)
      const buffer = Buffer.from(base64Data, 'base64') as Buffer
      return await uploadObject(buffer, key)
    }

    if (type === 'video') {
      return await downloadAndUploadVideo(source, key, 3, downloadHeaders)
    }

    const response = await fetch(toFetchableUrl(source))
    const buffer = Buffer.from(await response.arrayBuffer()) as Buffer
    return await uploadObject(buffer, key)
  }

  return await uploadObject(source, key)
}
