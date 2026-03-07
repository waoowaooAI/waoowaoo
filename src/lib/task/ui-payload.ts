function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function withTaskUiPayload(
  payload: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = asObject(payload) || {}
  const baseUi = asObject(base.ui) || {}
  return {
    ...base,
    ui: {
      ...baseUi,
      ...patch,
    },
  }
}
