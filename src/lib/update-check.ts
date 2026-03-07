export interface ParsedSemver {
  major: number
  minor: number
  patch: number
}

export interface GithubRelease {
  tagName: string
  htmlUrl: string
  name: string | null
  publishedAt: string | null
}

export type UpdateCheckResult =
  | { kind: 'no-release' }
  | { kind: 'no-update'; latestVersion: string; release: GithubRelease }
  | { kind: 'update-available'; latestVersion: string; release: GithubRelease }
  | {
      kind: 'error'
      reason: 'network' | 'http' | 'invalid-response' | 'invalid-version'
      message: string
      status?: number
    }

const SEMVER_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeSemverTag(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(SEMVER_PATTERN)
  if (!match) {
    throw new Error(`Invalid semver tag: ${value}`)
  }

  const major = Number.parseInt(match[1] ?? '', 10)
  const minor = Number.parseInt(match[2] ?? '', 10)
  const patch = Number.parseInt(match[3] ?? '', 10)

  if ([major, minor, patch].some((segment) => Number.isNaN(segment))) {
    throw new Error(`Invalid semver tag: ${value}`)
  }

  return `${major}.${minor}.${patch}`
}

export function parseSemver(value: string): ParsedSemver {
  const normalized = normalizeSemverTag(value)
  const [majorText, minorText, patchText] = normalized.split('.')

  return {
    major: Number.parseInt(majorText ?? '', 10),
    minor: Number.parseInt(minorText ?? '', 10),
    patch: Number.parseInt(patchText ?? '', 10),
  }
}

export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left)
  const b = parseSemver(right)

  if (a.major !== b.major) return a.major > b.major ? 1 : -1
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1
  return 0
}

export function shouldPulseUpdate(latestVersion: string, mutedVersion: string | null): boolean {
  return latestVersion !== mutedVersion
}

function parseGithubReleasePayload(payload: unknown): GithubRelease {
  if (!isRecord(payload)) {
    throw new Error('GitHub release payload must be an object')
  }

  const tagName = payload.tag_name
  const htmlUrl = payload.html_url
  const name = payload.name
  const publishedAt = payload.published_at

  if (typeof tagName !== 'string' || tagName.trim().length === 0) {
    throw new Error('GitHub release payload missing tag_name')
  }

  if (typeof htmlUrl !== 'string' || htmlUrl.trim().length === 0) {
    throw new Error('GitHub release payload missing html_url')
  }

  if (name !== null && typeof name !== 'string' && typeof name !== 'undefined') {
    throw new Error('GitHub release payload has invalid name')
  }

  if (publishedAt !== null && typeof publishedAt !== 'string' && typeof publishedAt !== 'undefined') {
    throw new Error('GitHub release payload has invalid published_at')
  }

  return {
    tagName: tagName.trim(),
    htmlUrl: htmlUrl.trim(),
    name: typeof name === 'string' ? name : null,
    publishedAt: typeof publishedAt === 'string' ? publishedAt : null,
  }
}

export interface CheckGithubReleaseUpdateInput {
  repository: string
  currentVersion: string
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

export async function checkGithubReleaseUpdate({
  repository,
  currentVersion,
  signal,
  fetchImpl,
}: CheckGithubReleaseUpdateInput): Promise<UpdateCheckResult> {
  const fetcher = fetchImpl ?? fetch

  try {
    normalizeSemverTag(currentVersion)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid current version'
    return {
      kind: 'error',
      reason: 'invalid-version',
      message,
    }
  }

  const endpoint = `https://api.github.com/repos/${repository}/releases/latest`

  let response: Response
  try {
    response = await fetcher(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
      },
      signal,
      cache: 'no-store',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GitHub request failed'
    return {
      kind: 'error',
      reason: 'network',
      message,
    }
  }

  if (response.status === 404) {
    return { kind: 'no-release' }
  }

  if (!response.ok) {
    return {
      kind: 'error',
      reason: 'http',
      message: `GitHub request failed with status ${response.status}`,
      status: response.status,
    }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return {
      kind: 'error',
      reason: 'invalid-response',
      message: 'GitHub release response is not valid JSON',
    }
  }

  let release: GithubRelease
  try {
    release = parseGithubReleasePayload(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GitHub release payload is invalid'
    return {
      kind: 'error',
      reason: 'invalid-response',
      message,
    }
  }

  let latestVersion = ''
  try {
    latestVersion = normalizeSemverTag(release.tagName)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Release tag is not valid semver'
    return {
      kind: 'error',
      reason: 'invalid-version',
      message,
    }
  }

  return compareSemver(latestVersion, currentVersion) > 0
    ? { kind: 'update-available', latestVersion, release }
    : { kind: 'no-update', latestVersion, release }
}
