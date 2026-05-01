export function createStoryNodeKey(projectId: string): string {
  return `story:${projectId}`
}

export function createScriptClipNodeKey(clipId: string): string {
  return `scriptClip:${clipId}`
}

export function createStoryboardGroupNodeKey(storyboardId: string): string {
  return `storyboardGroup:${storyboardId}`
}

export function createPanelImageNodeKey(panelId: string): string {
  return `panelImage:${panelId}`
}

export function createVideoPanelNodeKey(panelId: string): string {
  return `videoPanel:${panelId}`
}

export function createTimelineNodeKey(episodeId: string): string {
  return `timeline:${episodeId}`
}
