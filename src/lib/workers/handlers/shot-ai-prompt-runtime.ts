import type { Job } from 'bullmq'
import { chatCompletion } from '@/lib/llm-client'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'

export async function runShotPromptCompletion(params: {
  job: Job<TaskJobData>
  model: string
  prompt: string
  action: string
  streamContextKey: string
  streamStepId: string
  streamStepTitle: string
}) {
  const streamContext = createWorkerLLMStreamContext(params.job, params.streamContextKey)
  const streamCallbacks = createWorkerLLMStreamCallbacks(params.job, streamContext)
  return await (async () => {
    try {
      return await withInternalLLMStreamCallbacks(
        streamCallbacks,
        async () =>
          await chatCompletion(
            params.job.data.userId,
            params.model,
            [{ role: 'user', content: params.prompt }],
            {
              temperature: 0.7,
              projectId: params.job.data.projectId,
              action: params.action,
              streamStepId: params.streamStepId,
              streamStepTitle: params.streamStepTitle,
              streamStepIndex: 1,
              streamStepTotal: 1,
            },
          ),
      )
    } finally {
      await streamCallbacks.flush()
    }
  })()
}
