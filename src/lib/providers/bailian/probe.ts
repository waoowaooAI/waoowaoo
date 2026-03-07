import type { BailianProbeResult, BailianProbeStep } from './types'

function classifyStatus(status: number): string {
  if (status === 401 || status === 403) return `Authentication failed (${status})`
  if (status === 429) return `Rate limited (${status})`
  return `Provider error (${status})`
}

export async function probeBailian(apiKey: string): Promise<BailianProbeResult> {
  const steps: BailianProbeStep[] = []
  try {
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      steps.push({
        name: 'models',
        status: 'fail',
        message: classifyStatus(response.status),
        detail: detail.slice(0, 500),
      })
      steps.push({
        name: 'credits',
        status: 'skip',
        message: 'Not supported by Bailian probe API',
      })
      return { success: false, steps }
    }
    const data = await response.json() as { data?: Array<{ id?: string }> }
    const count = Array.isArray(data.data) ? data.data.length : 0
    steps.push({
      name: 'models',
      status: 'pass',
      message: `Found ${count} models`,
    })
    steps.push({
      name: 'credits',
      status: 'skip',
      message: 'Not supported by Bailian probe API',
    })
    return { success: true, steps }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    steps.push({
      name: 'models',
      status: 'fail',
      message: `Network error: ${message}`,
    })
    steps.push({
      name: 'credits',
      status: 'skip',
      message: 'Not supported by Bailian probe API',
    })
    return { success: false, steps }
  }
}
