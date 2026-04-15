'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function useVoicePlayback() {
  const [playingLineId, setPlayingLineId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handleTogglePlayAudio = useCallback((lineId: string, audioUrl: string) => {
    const currentAudio = audioRef.current

    if (currentAudio && playingLineId === lineId) {
      if (currentAudio.paused) {
        currentAudio.play().then(() => setPlayingLineId(lineId)).catch(() => setPlayingLineId(null))
      } else {
        currentAudio.pause()
        setPlayingLineId(null)
      }
      return
    }

    if (currentAudio) {
      currentAudio.pause()
      currentAudio.currentTime = 0
    }

    const audio = new Audio(audioUrl)
    audioRef.current = audio
    setPlayingLineId(lineId)

    audio.onended = () => {
      setPlayingLineId(null)
      if (audioRef.current === audio) audioRef.current = null
    }
    audio.onpause = () => {
      if (!audio.ended) setPlayingLineId(null)
    }

    audio.play().catch(() => setPlayingLineId(null))
  }, [playingLineId])

  useEffect(() => {
    return () => {
      if (!audioRef.current) return
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
  }, [])

  return {
    playingLineId,
    handleTogglePlayAudio,
  }
}
