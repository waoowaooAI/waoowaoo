import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import COS from 'cos-nodejs-sdk-v5'
import { prisma } from '@/lib/prisma'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { MEDIA_MODEL_MAPPINGS } from './media-mapping'

type StorageEntry = {
  key: string
  sizeBytes: number
  lastModified: string | null
}
type CosBucketPage = {
  Contents?: Array<{ Key: string; Size?: string | number; LastModified?: string }>
  IsTruncated?: string | boolean
  NextMarker?: string
}
type DynamicModel = {
  findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>
}
const prismaDynamic = prisma as unknown as Record<string, DynamicModel>

const BACKUP_ROOT = path.join(process.cwd(), 'data', 'migration-backups')

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function listLocalObjects(): Promise<StorageEntry[]> {
  const uploadDir = process.env.UPLOAD_DIR || './data/uploads'
  const rootDir = path.isAbsolute(uploadDir) ? uploadDir : path.join(process.cwd(), uploadDir)
  const exists = await fs.stat(rootDir).then(() => true).catch(() => false)
  if (!exists) return []

  const rows: StorageEntry[] = []
  const queue = ['']

  while (queue.length > 0) {
    const rel = queue.shift() as string
    const full = path.join(rootDir, rel)
    const entries = await fs.readdir(full, { withFileTypes: true })
    for (const entry of entries) {
      const childRel = path.join(rel, entry.name)
      if (entry.isDirectory()) {
        queue.push(childRel)
        continue
      }
      if (!entry.isFile()) continue
      const stat = await fs.stat(path.join(rootDir, childRel))
      rows.push({
        key: childRel.split(path.sep).join('/'),
        sizeBytes: stat.size,
        lastModified: stat.mtime.toISOString(),
      })
    }
  }

  return rows
}

async function listCosObjects(): Promise<StorageEntry[]> {
  const secretId = process.env.COS_SECRET_ID
  const secretKey = process.env.COS_SECRET_KEY
  const bucket = process.env.COS_BUCKET
  const region = process.env.COS_REGION

  if (!secretId || !secretKey || !bucket || !region) {
    throw new Error('Missing COS env: COS_SECRET_ID/COS_SECRET_KEY/COS_BUCKET/COS_REGION')
  }

  const cos = new COS({ SecretId: secretId, SecretKey: secretKey, Timeout: 60_000 })
  const rows: StorageEntry[] = []
  let marker = ''

  while (true) {
    const page = await new Promise<CosBucketPage>((resolve, reject) => {
      cos.getBucket(
        {
          Bucket: bucket,
          Region: region,
          Marker: marker,
          MaxKeys: 1000,
        },
        (err, data) => (err ? reject(err) : resolve(data as unknown as CosBucketPage)),
      )
    })

    const contents = page.Contents || []
    for (const item of contents) {
      rows.push({
        key: item.Key,
        sizeBytes: Number(item.Size || 0),
        lastModified: item.LastModified || null,
      })
    }

    const truncated = String(page.IsTruncated || 'false') === 'true'
    if (!truncated) break
    const nextMarker = typeof page.NextMarker === 'string' ? page.NextMarker : ''
    marker = nextMarker || (contents.length ? contents[contents.length - 1].Key : '')
    if (!marker) break
  }

  return rows
}

async function listStorageObjects() {
  const storageType = process.env.STORAGE_TYPE || 'cos'
  if (storageType === 'local') {
    return { storageType, rows: await listLocalObjects() }
  }
  return { storageType, rows: await listCosObjects() }
}

async function buildReferencedKeySet() {
  const refs = new Set<string>()

  try {
    const mediaRows = await prismaDynamic.mediaObject.findMany({
      select: { storageKey: true },
    })
    for (const row of mediaRows) {
      if (typeof row.storageKey === 'string' && row.storageKey.trim()) refs.add(row.storageKey)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    _ulogError('[media-build-unreferenced-index] media_objects unavailable, fallback to legacy field scan', message)
  }

  for (const mapping of MEDIA_MODEL_MAPPINGS) {
    const model = prismaDynamic[mapping.model]
    if (!model) continue

    const select: Record<string, true> = { id: true }
    for (const field of mapping.fields) select[field.legacyField] = true

    let cursor: string | null = null
    while (true) {
      const rows = await model.findMany({
        select,
        ...(cursor
          ? {
            cursor: { id: cursor },
            skip: 1,
          }
          : {}),
        orderBy: { id: 'asc' },
        take: 500,
      })
      if (!rows.length) break

      for (const row of rows) {
        for (const field of mapping.fields) {
          const value = row[field.legacyField]
          if (typeof value !== 'string' || !value.trim()) continue
          const key = await resolveStorageKeyFromMediaValue(value)
          if (key) refs.add(key)
        }
      }

      cursor = String(rows[rows.length - 1].id)
    }
  }

  return refs
}

async function main() {
  const stamp = nowStamp()
  const backupDir = path.join(BACKUP_ROOT, stamp)
  await fs.mkdir(backupDir, { recursive: true })

  const referenced = await buildReferencedKeySet()
  const storage = await listStorageObjects()
  const unreferenced = storage.rows.filter((row) => !referenced.has(row.key))

  const output = {
    createdAt: new Date().toISOString(),
    storageType: storage.storageType,
    totalStorageObjects: storage.rows.length,
    referencedKeyCount: referenced.size,
    unreferencedCount: unreferenced.length,
    objects: unreferenced,
  }

  const filePath = path.join(backupDir, 'unreferenced-storage-objects-index.json')
  await fs.writeFile(filePath, JSON.stringify(output, null, 2), 'utf8')

  _ulogInfo(`[media-build-unreferenced-index] storageType=${storage.storageType}`)
  _ulogInfo(`[media-build-unreferenced-index] total=${storage.rows.length} unreferenced=${unreferenced.length}`)
  _ulogInfo(`[media-build-unreferenced-index] output=${filePath}`)
}

main()
  .catch((error) => {
    _ulogError('[media-build-unreferenced-index] failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
