export interface MediaRef {
  id: string
  publicId: string
  url: string
  mimeType: string | null
  sizeBytes: number | null
  width: number | null
  height: number | null
  durationMs: number | null
  sha256?: string | null
  updatedAt?: string | null
  storageKey?: string
}
