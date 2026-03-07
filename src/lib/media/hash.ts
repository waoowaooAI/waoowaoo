import { createHash } from 'node:crypto'

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function stablePublicIdFromStorageKey(storageKey: string): string {
  return `m_${sha256Hex(storageKey).slice(0, 40)}`
}
