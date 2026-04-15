import { readApiErrorMessage } from '@/lib/api/read-error-message'

interface ProjectCreationPayload {
  project?: {
    id?: string | null
  } | null
}

interface EpisodeCreationPayload {
  episode?: {
    id?: string | null
  } | null
}

interface ApiFetchLike {
  (input: string, init?: RequestInit): Promise<Response>
}

export interface HomeWorkspaceLaunchTarget {
  pathname: string
  query: {
    episode: string
    autoRun?: 'storyToScript'
  }
}

export interface CreateHomeProjectLaunchParams {
  apiFetch: ApiFetchLike
  projectName: string
  storyText: string
  videoRatio: string
  artStyle: string
  episodeName: string
}

export interface CreateHomeProjectLaunchResult {
  projectId: string
  episodeId: string
  target: HomeWorkspaceLaunchTarget
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function readNestedString(
  source: Record<string, unknown> | null,
  outerKey: string,
  innerKey: string,
): string | null {
  const outer = readObject(source?.[outerKey])
  const value = outer?.[innerKey]
  return typeof value === 'string' && value.trim() ? value : null
}

async function readProjectId(response: Response): Promise<string> {
  const payload = await response.json() as ProjectCreationPayload
  const projectId = readNestedString(readObject(payload), 'project', 'id')
  if (!projectId) {
    throw new Error('Project creation response missing project id')
  }
  return projectId
}

async function readEpisodeId(response: Response): Promise<string> {
  const payload = await response.json() as EpisodeCreationPayload
  const episodeId = readNestedString(readObject(payload), 'episode', 'id')
  if (!episodeId) {
    throw new Error('Episode creation response missing episode id')
  }
  return episodeId
}

export function buildHomeWorkspaceLaunchTarget(projectId: string, episodeId: string): HomeWorkspaceLaunchTarget {
  return {
    pathname: `/workspace/${projectId}`,
    query: {
      episode: episodeId,
      autoRun: 'storyToScript',
    },
  }
}

export async function createHomeProjectLaunch({
  apiFetch,
  projectName,
  storyText,
  videoRatio,
  artStyle,
  episodeName,
}: CreateHomeProjectLaunchParams): Promise<CreateHomeProjectLaunchResult> {
  const projectResponse = await apiFetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: projectName,
    }),
  })

  if (!projectResponse.ok) {
    throw new Error(await readApiErrorMessage(projectResponse, 'Failed to create project'))
  }

  const projectId = await readProjectId(projectResponse)

  const configResponse = await apiFetch(`/api/projects/${projectId}/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoRatio, artStyle }),
  })

  if (!configResponse.ok) {
    throw new Error(await readApiErrorMessage(configResponse, 'Failed to save project config'))
  }

  const episodeResponse = await apiFetch(`/api/projects/${projectId}/episodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: episodeName,
      novelText: storyText,
    }),
  })

  if (!episodeResponse.ok) {
    throw new Error(await readApiErrorMessage(episodeResponse, 'Failed to create first episode'))
  }

  const episodeId = await readEpisodeId(episodeResponse)

  return {
    projectId,
    episodeId,
    target: buildHomeWorkspaceLaunchTarget(projectId, episodeId),
  }
}
