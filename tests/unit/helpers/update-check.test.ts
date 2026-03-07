import { describe, expect, it, vi } from 'vitest'
import {
  checkGithubReleaseUpdate,
  compareSemver,
  normalizeSemverTag,
  shouldPulseUpdate,
} from '@/lib/update-check'

describe('update-check semver helpers', () => {
  it('normalizes semver tag with v prefix', () => {
    expect(normalizeSemverTag('v0.3.0')).toBe('0.3.0')
  })

  it('supports prerelease suffix while comparing base semver', () => {
    expect(normalizeSemverTag('v0.3.0-rc.1')).toBe('0.3.0')
    expect(compareSemver('0.3.0-rc.1', '0.2.9')).toBe(1)
  })

  it('throws for malformed semver', () => {
    expect(() => normalizeSemverTag('0.3')).toThrowError('Invalid semver tag: 0.3')
  })

  it('compares semver in numeric order', () => {
    expect(compareSemver('0.3.0', '0.2.9')).toBe(1)
    expect(compareSemver('0.2.0', '0.2.0')).toBe(0)
    expect(compareSemver('0.1.9', '0.2.0')).toBe(-1)
  })

  it('pulses only when this version was not muted', () => {
    expect(shouldPulseUpdate('0.3.0', null)).toBe(true)
    expect(shouldPulseUpdate('0.3.0', '0.2.9')).toBe(true)
    expect(shouldPulseUpdate('0.3.0', '0.3.0')).toBe(false)
  })
})

describe('checkGithubReleaseUpdate', () => {
  it('returns no-release when GitHub has no releases yet', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }))

    const result = await checkGithubReleaseUpdate({
      repository: 'owner/repo',
      currentVersion: '0.2.0',
      fetchImpl: fetchMock,
    })

    expect(result).toEqual({ kind: 'no-release' })
  })

  it('returns update-available when latest release is newer', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({
        tag_name: 'v0.3.0',
        html_url: 'https://github.com/owner/repo/releases/tag/v0.3.0',
        name: 'v0.3.0',
        published_at: '2026-03-03T10:00:00Z',
      }),
      { status: 200 },
    ))

    const result = await checkGithubReleaseUpdate({
      repository: 'owner/repo',
      currentVersion: '0.2.0',
      fetchImpl: fetchMock,
    })

    expect(result.kind).toBe('update-available')
    if (result.kind !== 'update-available') {
      throw new Error('expected update-available result')
    }

    expect(result.latestVersion).toBe('0.3.0')
    expect(result.release.tagName).toBe('v0.3.0')
  })

  it('returns no-update when latest release equals current version', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({
        tag_name: 'v0.2.0',
        html_url: 'https://github.com/owner/repo/releases/tag/v0.2.0',
        name: 'v0.2.0',
        published_at: '2026-03-03T10:00:00Z',
      }),
      { status: 200 },
    ))

    const result = await checkGithubReleaseUpdate({
      repository: 'owner/repo',
      currentVersion: '0.2.0',
      fetchImpl: fetchMock,
    })

    expect(result.kind).toBe('no-update')
    if (result.kind !== 'no-update') {
      throw new Error('expected no-update result')
    }

    expect(result.latestVersion).toBe('0.2.0')
  })

  it('returns error when release tag is not valid semver', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({
        tag_name: 'release-2026-03-03',
        html_url: 'https://github.com/owner/repo/releases/tag/release-2026-03-03',
      }),
      { status: 200 },
    ))

    const result = await checkGithubReleaseUpdate({
      repository: 'owner/repo',
      currentVersion: '0.2.0',
      fetchImpl: fetchMock,
    })

    expect(result.kind).toBe('error')
    if (result.kind !== 'error') {
      throw new Error('expected error result')
    }

    expect(result.reason).toBe('invalid-version')
  })
})
