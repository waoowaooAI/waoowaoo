export interface EpisodeLike {
  id: string
}

export function resolveSelectedEpisodeId(
  episodes: ReadonlyArray<EpisodeLike>,
  urlEpisodeId: string | null,
): string | null {
  if (episodes.length === 0) return null
  if (urlEpisodeId && episodes.some((episode) => episode.id === urlEpisodeId)) {
    return urlEpisodeId
  }
  return episodes[0].id
}
