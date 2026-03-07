import type { QueryKey } from '@tanstack/react-query'

interface QueryFilter {
  queryKey: QueryKey
  exact?: boolean
}

type Updater<T> = T | ((previous: T | undefined) => T | undefined)

interface StoredQueryEntry {
  queryKey: QueryKey
  data: unknown
}

function isPrefixQueryKey(target: QueryKey, prefix: QueryKey): boolean {
  if (prefix.length > target.length) return false
  return prefix.every((value, index) => Object.is(value, target[index]))
}

function keyOf(queryKey: QueryKey): string {
  return JSON.stringify(queryKey)
}

export class MockQueryClient {
  private readonly queryMap = new Map<string, StoredQueryEntry>()

  async cancelQueries(filters: QueryFilter): Promise<void> {
    void filters
  }

  seedQuery<T>(queryKey: QueryKey, data: T | undefined) {
    this.queryMap.set(keyOf(queryKey), {
      queryKey,
      data,
    })
  }

  getQueryData<T>(queryKey: QueryKey): T | undefined {
    const entry = this.queryMap.get(keyOf(queryKey))
    return entry?.data as T | undefined
  }

  setQueryData<T>(queryKey: QueryKey, updater: Updater<T | undefined>) {
    const previous = this.getQueryData<T>(queryKey)
    const next = typeof updater === 'function'
      ? (updater as (prev: T | undefined) => T | undefined)(previous)
      : updater
    this.seedQuery(queryKey, next)
  }

  getQueriesData<T>(filters: QueryFilter): Array<[QueryKey, T | undefined]> {
    const matched: Array<[QueryKey, T | undefined]> = []
    for (const { queryKey, data } of this.queryMap.values()) {
      const isMatch = filters.exact
        ? keyOf(filters.queryKey) === keyOf(queryKey)
        : isPrefixQueryKey(queryKey, filters.queryKey)
      if (!isMatch) continue
      matched.push([queryKey, data as T | undefined])
    }
    return matched
  }

  setQueriesData<T>(
    filters: QueryFilter,
    updater: (previous: T | undefined) => T | undefined,
  ) {
    const matches = this.getQueriesData<T>(filters)
    matches.forEach(([queryKey, previous]) => {
      this.seedQuery(queryKey, updater(previous))
    })
  }
}
