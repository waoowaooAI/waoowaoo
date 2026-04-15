export function reuseStringArrayIfEqual(previous: string[], next: string[]): string[] {
  if (previous.length !== next.length) {
    return next
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) {
      return next
    }
  }

  return previous
}

export function reuseStringSetIfEqual(previous: Set<string>, next: Set<string>): Set<string> {
  if (previous.size !== next.size) {
    return next
  }

  for (const value of previous) {
    if (!next.has(value)) {
      return next
    }
  }

  return previous
}
