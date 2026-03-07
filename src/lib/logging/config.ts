import type { LogLevel } from './types'

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
}

function parseLevel(value?: string | null): LogLevel {
  const upper = (value || 'ERROR').trim().toUpperCase()
  if (upper === 'DEBUG' || upper === 'INFO' || upper === 'WARN' || upper === 'ERROR') {
    return upper
  }
  return 'ERROR'
}

function parseBoolean(value?: string | null, fallback = false): boolean {
  if (value == null) return fallback
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export const LOG_CONFIG = {
  enabled: parseBoolean(process.env.LOG_UNIFIED_ENABLED, true),
  level: parseLevel(process.env.LOG_LEVEL),
  debugEnabled: parseBoolean(process.env.LOG_DEBUG_ENABLED, false),
  auditEnabled: parseBoolean(process.env.LOG_AUDIT_ENABLED, true),
  format: (process.env.LOG_FORMAT || 'json').trim().toLowerCase(),
  service: (process.env.LOG_SERVICE || 'waoowaoo').trim(),
  redactKeys: (process.env.LOG_REDACT_KEYS || 'password,token,apiKey,apikey,authorization,cookie,secret,access_token,refresh_token')
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean),
} as const

export function shouldLogLevel(level: LogLevel): boolean {
  if (!LOG_CONFIG.enabled) return false
  if (level === 'DEBUG' && !LOG_CONFIG.debugEnabled) return false
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[LOG_CONFIG.level]
}
