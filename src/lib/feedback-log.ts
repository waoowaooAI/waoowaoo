import type { Locale } from '@/i18n'

export type FeedbackContextStage =
  | 'config'
  | 'assets'
  | 'storyboard'
  | 'videos'
  | 'voice'

export type FeedbackLogParams = {
  locale: Locale
  projectId: string
  episodeId?: string | null
  stage: FeedbackContextStage
  errorMessage?: string | null
}

export function buildFeedbackLog({
  locale,
  projectId,
  episodeId,
  stage,
  errorMessage,
}: FeedbackLogParams): string {
  const lines: string[] = []
  lines.push('[User Feedback Context]')
  lines.push(`Locale: ${locale}`)
  lines.push(`Project ID: ${projectId}`)
  if (episodeId) {
    lines.push(`Episode ID: ${episodeId}`)
  }
  lines.push(`Stage: ${stage}`)
  if (errorMessage) {
    lines.push('')
    lines.push('[Error]')
    lines.push(errorMessage)
  }
  lines.push('')
  lines.push('Please paste this block into the Feishu feedback form.')
  return lines.join('\n')
}

