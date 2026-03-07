import { StorageConfigError } from '@/lib/storage/errors'
import { LocalStorageProvider } from '@/lib/storage/providers/local'
import { MinioStorageProvider } from '@/lib/storage/providers/minio'
import { CosStorageProvider } from '@/lib/storage/providers/cos'
import type { StorageFactoryOptions, StorageProvider, StorageType } from '@/lib/storage/types'

function normalizeStorageType(rawType: string | undefined): StorageType {
  const normalized = (rawType || 'minio').trim().toLowerCase()
  if (normalized === 'minio' || normalized === 'local' || normalized === 'cos') {
    return normalized
  }
  throw new StorageConfigError(`Unsupported STORAGE_TYPE: ${rawType}`)
}

export function createStorageProvider(options: StorageFactoryOptions = {}): StorageProvider {
  const type = normalizeStorageType(options.storageType || process.env.STORAGE_TYPE)

  if (type === 'minio') {
    return new MinioStorageProvider()
  }
  if (type === 'local') {
    return new LocalStorageProvider()
  }

  return new CosStorageProvider()
}
