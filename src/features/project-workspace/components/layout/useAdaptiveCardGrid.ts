'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

interface AdaptiveCardGridOptions {
  itemCount: number
  minCardWidth: number
  maxCardWidth: number
  gap?: number
}

interface AdaptiveCardGridLayout {
  columns: number
  cardWidth: number
  width: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function calculateAdaptiveGridLayout(
  availableWidth: number,
  itemCount: number,
  minCardWidth: number,
  maxCardWidth: number,
  gap: number,
): AdaptiveCardGridLayout {
  const safeItemCount = Math.max(1, itemCount)
  const safeAvailableWidth = Math.max(1, availableWidth)
  const maxColumnsByMinWidth = Math.max(1, Math.floor((safeAvailableWidth + gap) / (minCardWidth + gap)))
  const idealColumnsByMaxWidth = Math.max(1, Math.round((safeAvailableWidth + gap) / (maxCardWidth + gap)))
  const columns = clamp(idealColumnsByMaxWidth, 1, Math.min(safeItemCount, maxColumnsByMinWidth))
  const widthWithoutGaps = safeAvailableWidth - gap * (columns - 1)
  const cardWidth = Math.min(maxCardWidth, Math.max(minCardWidth, widthWithoutGaps / columns))
  const width = cardWidth * columns + gap * (columns - 1)

  return { columns, cardWidth, width }
}

export function useAdaptiveCardGrid({
  itemCount,
  minCardWidth,
  maxCardWidth,
  gap = 16,
}: AdaptiveCardGridOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [availableWidth, setAvailableWidth] = useState(0)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateWidth = () => {
      setAvailableWidth(element.getBoundingClientRect().width)
    }

    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  const layout = useMemo(() => {
    if (!availableWidth) return null

    return calculateAdaptiveGridLayout(availableWidth, itemCount, minCardWidth, maxCardWidth, gap)
  }, [availableWidth, gap, itemCount, maxCardWidth, minCardWidth])

  const gridStyle = useMemo<CSSProperties | undefined>(() => {
    if (!layout) return undefined

    return {
      gridTemplateColumns: `repeat(${layout.columns}, minmax(0, ${layout.cardWidth}px))`,
      gap,
    }
  }, [gap, layout])

  const contentStyle = useMemo<CSSProperties | undefined>(() => {
    if (!layout) return undefined

    return {
      width: layout.width,
      maxWidth: '100%',
    }
  }, [layout])

  return {
    containerRef,
    contentStyle,
    gridStyle,
    layout,
  }
}
