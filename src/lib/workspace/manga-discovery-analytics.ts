import { logEvent } from '@/lib/logging/core'

export type WorkspaceMangaAnalyticsEvent =
  | 'workspace_manga_cta_view'
  | 'workspace_manga_cta_click'
  | 'workspace_project_mode_selected'

export function trackWorkspaceMangaEvent(
  event: WorkspaceMangaAnalyticsEvent,
  details: Record<string, unknown> = {},
): void {
  logEvent({
    level: 'INFO',
    module: 'workspace',
    action: 'WORKSPACE_MANGA_DISCOVERY',
    message: event,
    details: {
      event,
      ...details,
    },
  })
}
