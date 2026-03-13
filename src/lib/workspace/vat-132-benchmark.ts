export type Vat132BenchmarkFlowId =
  | 'manga_quickstart_blank'
  | 'manga_template_story_text'
  | 'manga_legacy_quickmanga_bridge'

export interface Vat132BenchmarkRun {
  flowId: Vat132BenchmarkFlowId
  label: string
  startedAt: string
  firstPanelAt: string
  notes?: string
}

export interface Vat132BenchmarkPair {
  flowId: Vat132BenchmarkFlowId
  label: string
  baseline: Vat132BenchmarkRun
  candidate: Vat132BenchmarkRun
}

export interface Vat132BenchmarkComparison {
  flowId: Vat132BenchmarkFlowId
  label: string
  baselineMs: number
  candidateMs: number
  deltaMs: number
  improvementPct: number
  meetsTarget: boolean
}

export interface Vat132BenchmarkSummary {
  targetImprovementPct: number
  comparisons: Vat132BenchmarkComparison[]
  overall: {
    flowCount: number
    metCount: number
    allMet: boolean
    avgImprovementPct: number | null
  }
}

function toMs(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid timestamp: ${value}`)
  }
  return parsed
}

export function calculateTimeToFirstPanelMs(run: Vat132BenchmarkRun): number {
  const startMs = toMs(run.startedAt)
  const firstPanelMs = toMs(run.firstPanelAt)
  const durationMs = firstPanelMs - startMs
  if (durationMs < 0) {
    throw new Error(`firstPanelAt precedes startedAt for flow ${run.flowId}`)
  }
  return durationMs
}

export function compareVat132BenchmarkPair(
  pair: Vat132BenchmarkPair,
  targetImprovementPct = 30,
): Vat132BenchmarkComparison {
  const baselineMs = calculateTimeToFirstPanelMs(pair.baseline)
  const candidateMs = calculateTimeToFirstPanelMs(pair.candidate)
  const deltaMs = baselineMs - candidateMs
  const improvementPct = baselineMs > 0
    ? Number((((baselineMs - candidateMs) / baselineMs) * 100).toFixed(2))
    : 0

  return {
    flowId: pair.flowId,
    label: pair.label,
    baselineMs,
    candidateMs,
    deltaMs,
    improvementPct,
    meetsTarget: improvementPct >= targetImprovementPct,
  }
}

export function summarizeVat132Benchmarks(
  pairs: Vat132BenchmarkPair[],
  targetImprovementPct = 30,
): Vat132BenchmarkSummary {
  const comparisons = pairs.map((pair) => compareVat132BenchmarkPair(pair, targetImprovementPct))
  const metCount = comparisons.filter((comparison) => comparison.meetsTarget).length
  const avgImprovementPct = comparisons.length > 0
    ? Number((comparisons.reduce((sum, item) => sum + item.improvementPct, 0) / comparisons.length).toFixed(2))
    : null

  return {
    targetImprovementPct,
    comparisons,
    overall: {
      flowCount: comparisons.length,
      metCount,
      allMet: comparisons.length > 0 && metCount === comparisons.length,
      avgImprovementPct,
    },
  }
}

export function renderVat132BenchmarkMarkdown(summary: Vat132BenchmarkSummary): string {
  const lines = [
    '# VAT-132 — Time-to-first-panel benchmark summary',
    '',
    `- Target improvement: **>= ${summary.targetImprovementPct}%**`,
    `- Flow count: **${summary.overall.flowCount}**`,
    `- Flows meeting target: **${summary.overall.metCount}/${summary.overall.flowCount}**`,
    `- Overall verdict: **${summary.overall.allMet ? 'PASS' : 'NOT YET'}**`,
    `- Average improvement: **${summary.overall.avgImprovementPct ?? 0}%**`,
    '',
    '| Flow | Baseline (ms) | Candidate (ms) | Delta (ms) | Improvement | Verdict |',
    '|---|---:|---:|---:|---:|---|',
  ]

  for (const comparison of summary.comparisons) {
    lines.push(
      `| ${comparison.label} | ${comparison.baselineMs} | ${comparison.candidateMs} | ${comparison.deltaMs} | ${comparison.improvementPct}% | ${comparison.meetsTarget ? 'PASS' : 'FAIL'} |`,
    )
  }

  lines.push('', '## Notes', '', '- This summary is generated from paired baseline/candidate benchmark runs.', '- Use together with before/after screenshot evidence for VAT-132 closure.', '')

  return lines.join('\n')
}
