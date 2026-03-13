import { describe, expect, it } from 'vitest'
import {
  calculateTimeToFirstPanelMs,
  compareVat132BenchmarkPair,
  renderVat132BenchmarkMarkdown,
  summarizeVat132Benchmarks,
  type Vat132BenchmarkPair,
} from '@/lib/workspace/vat-132-benchmark'

const samplePair: Vat132BenchmarkPair = {
  flowId: 'manga_quickstart_blank',
  label: 'Manga quickstart / blank',
  baseline: {
    flowId: 'manga_quickstart_blank',
    label: 'baseline',
    startedAt: '2026-03-13T09:00:00.000Z',
    firstPanelAt: '2026-03-13T09:00:10.000Z',
  },
  candidate: {
    flowId: 'manga_quickstart_blank',
    label: 'candidate',
    startedAt: '2026-03-13T09:10:00.000Z',
    firstPanelAt: '2026-03-13T09:10:06.500Z',
  },
}

describe('VAT-132 benchmark helpers', () => {
  it('calculates time-to-first-panel in milliseconds', () => {
    expect(calculateTimeToFirstPanelMs(samplePair.baseline)).toBe(10_000)
    expect(calculateTimeToFirstPanelMs(samplePair.candidate)).toBe(6_500)
  })

  it('compares a benchmark pair against the >=30% target', () => {
    const comparison = compareVat132BenchmarkPair(samplePair)
    expect(comparison.improvementPct).toBe(35)
    expect(comparison.meetsTarget).toBe(true)
    expect(comparison.deltaMs).toBe(3_500)
  })

  it('summarizes multiple flows and preserves pass/fail state', () => {
    const summary = summarizeVat132Benchmarks([
      samplePair,
      {
        flowId: 'manga_legacy_quickmanga_bridge',
        label: 'Legacy quickManga bridge',
        baseline: {
          flowId: 'manga_legacy_quickmanga_bridge',
          label: 'baseline',
          startedAt: '2026-03-13T09:20:00.000Z',
          firstPanelAt: '2026-03-13T09:20:12.000Z',
        },
        candidate: {
          flowId: 'manga_legacy_quickmanga_bridge',
          label: 'candidate',
          startedAt: '2026-03-13T09:21:00.000Z',
          firstPanelAt: '2026-03-13T09:21:09.500Z',
        },
      },
    ])

    expect(summary.overall.flowCount).toBe(2)
    expect(summary.overall.metCount).toBe(1)
    expect(summary.overall.allMet).toBe(false)
  })

  it('renders markdown suitable for evidence artifacts', () => {
    const markdown = renderVat132BenchmarkMarkdown(summarizeVat132Benchmarks([samplePair]))
    expect(markdown).toContain('VAT-132 — Time-to-first-panel benchmark summary')
    expect(markdown).toContain('Manga quickstart / blank')
    expect(markdown).toContain('PASS')
  })
})
