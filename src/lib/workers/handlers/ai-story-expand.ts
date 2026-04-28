import type { Job } from 'bullmq'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { buildAiPrompt as buildPrompt, AI_PROMPT_IDS as PROMPT_IDS } from '@/lib/ai-prompts'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export async function handleAiStoryExpandTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const promptInput = readText(payload.prompt).trim()
  const analysisModel = readText(payload.analysisModel).trim()

  if (!promptInput) {
    throw new Error('prompt is required')
  }
  if (!analysisModel) {
    throw new Error('analysisModel is required')
  }

  const prompt = buildPrompt({
    promptId: PROMPT_IDS.SCRIPT_EXPAND_STORY,
    locale: job.data.locale,
    variables: {
      input: promptInput,
    },
  })

  await reportTaskProgress(job, 25, {
    stage: 'ai_story_expand_prepare',
    stageLabel: '准备故事扩写参数',
    displayMode: 'loading',
  })
  await assertTaskActive(job, 'ai_story_expand_prepare')

  const streamContext = createWorkerLLMStreamContext(job, 'ai_story_expand')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)

  const completion = await withInternalLLMStreamCallbacks(
    streamCallbacks,
    async () =>
      await executeAiTextStep({
        userId: job.data.userId,
        model: analysisModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        projectId: job.data.projectId || 'home-ai-write',
        action: 'ai_story_expand',
        meta: {
          stepId: 'ai_story_expand',
          stepTitle: '故事扩写',
          stepIndex: 1,
          stepTotal: 1,
        },
      }),
  )
  await streamCallbacks.flush()
  await assertTaskActive(job, 'ai_story_expand_persist')

  const expandedText = completion.text.trim()
  if (!expandedText) {
    throw new Error('AI story expand response is empty')
  }

  await reportTaskProgress(job, 96, {
    stage: 'ai_story_expand_done',
    stageLabel: '故事扩写已完成',
    displayMode: 'loading',
  })

  return {
    expandedText,
  }
}
