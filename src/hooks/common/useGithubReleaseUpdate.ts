'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  checkGithubReleaseUpdate,
  normalizeSemverTag,
  shouldPulseUpdate,
} from '@/lib/update-check'
import { APP_VERSION, GITHUB_REPOSITORY } from '@/lib/app-meta'

const ONE_HOUR_IN_MS = 60 * 60 * 1000
const MUTED_UPDATE_VERSION_KEY = 'waoowaoo:update:muted-version'

export interface ReleaseUpdateInfo {
  latestVersion: string
  releaseUrl: string
  releaseName: string | null
  publishedAt: string | null
}

export interface UseGithubReleaseUpdateResult {
  currentVersion: string
  update: ReleaseUpdateInfo | null
  shouldPulse: boolean
  showModal: boolean
  isChecking: boolean
  checkError: string | null
  openModal: () => void
  dismissCurrentUpdate: () => void
  checkNow: () => Promise<void>
}

function readMutedUpdateVersion(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(MUTED_UPDATE_VERSION_KEY)
}

function writeMutedUpdateVersion(version: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MUTED_UPDATE_VERSION_KEY, version)
}

export function useGithubReleaseUpdate(): UseGithubReleaseUpdateResult {
  const currentVersion = useMemo(() => normalizeSemverTag(APP_VERSION), [])

  const [update, setUpdate] = useState<ReleaseUpdateInfo | null>(null)
  const [shouldPulse, setShouldPulse] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const latestRequestRef = useRef(0)

  const checkNow = useCallback(async () => {
    const requestId = latestRequestRef.current + 1
    latestRequestRef.current = requestId
    setIsChecking(true)

    const result = await checkGithubReleaseUpdate({
      repository: GITHUB_REPOSITORY,
      currentVersion,
    })
    if (requestId !== latestRequestRef.current) return

    if (result.kind === 'error') {
      setCheckError(result.message)
      setUpdate(null)
      setShouldPulse(false)
      setShowModal(false)
      setIsChecking(false)
      return
    }

    setCheckError(null)

    if (result.kind === 'no-release') {
      setUpdate(null)
      setShouldPulse(false)
      setShowModal(false)
      setIsChecking(false)
      return
    }

    if (result.kind === 'no-update') {
      setUpdate(null)
      setShouldPulse(false)
      setShowModal(false)
      setIsChecking(false)
      return
    }

    const nextUpdate: ReleaseUpdateInfo = {
      latestVersion: result.latestVersion,
      releaseUrl: result.release.htmlUrl,
      releaseName: result.release.name,
      publishedAt: result.release.publishedAt,
    }

    const mutedVersion = readMutedUpdateVersion()
    setShouldPulse(shouldPulseUpdate(nextUpdate.latestVersion, mutedVersion))
    setUpdate(nextUpdate)
    setIsChecking(false)
  }, [currentVersion])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (cancelled) return
      await checkNow()
    }

    void run()
    const timer = window.setInterval(() => {
      void run()
    }, ONE_HOUR_IN_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [checkNow])

  const dismissCurrentUpdate = useCallback(() => {
    if (update) {
      writeMutedUpdateVersion(update.latestVersion)
    }
    setShouldPulse(false)
    setShowModal(false)
  }, [update])

  const openModal = useCallback(() => {
    if (!update) return
    setShowModal(true)
  }, [update])

  return {
    currentVersion,
    update,
    shouldPulse,
    showModal,
    isChecking,
    checkError,
    openModal,
    dismissCurrentUpdate,
    checkNow,
  }
}
