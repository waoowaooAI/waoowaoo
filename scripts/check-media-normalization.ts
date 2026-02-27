import { execSync } from 'node:child_process'

const TARGETS = ['src/app/api', 'src/lib']

const EXTRACT_ALLOWLIST = new Set<string>([
  'src/lib/media/service.ts',
  'src/lib/cos.ts',
])

const FETCH_MEDIA_ALLOWLIST = new Set<string>([
  'src/lib/cos.ts',
  'src/lib/media-process.ts',
  'src/lib/image-cache.ts',
  'src/lib/image-label.ts',
  'src/lib/workers/utils.ts',
  'src/app/api/novel-promotion/[projectId]/download-images/route.ts',
  'src/app/api/novel-promotion/[projectId]/download-videos/route.ts',
  'src/app/api/novel-promotion/[projectId]/download-voices/route.ts',
  'src/app/api/novel-promotion/[projectId]/update-asset-label/route.ts',
  'src/app/api/novel-promotion/[projectId]/voice-generate/route.ts',
  'src/app/api/novel-promotion/[projectId]/video-proxy/route.ts',
])

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8' })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'stdout' in error) {
      const stdout = (error as { stdout?: unknown }).stdout
      return typeof stdout === 'string' ? stdout : ''
    }
    return ''
  }
}

function parseLines(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function getFile(line: string): string {
  return line.split(':', 1)[0] || ''
}

function getCode(line: string): string {
  const parts = line.split(':')
  return parts.slice(2).join(':').trim()
}

function extractFetchArg(code: string): string {
  const matched = code.match(/fetch\(\s*([^)]+)\)/)
  return matched?.[1]?.trim() || ''
}

function isSafeFetchArg(arg: string): boolean {
  if (!arg) return false
  if (/^toFetchableUrl\(/.test(arg)) return true
  if (/^['"`]/.test(arg)) return true
  if (/^new URL\(/.test(arg)) return true
  return false
}

function isMediaLikeFetchArg(arg: string): boolean {
  return /(image|video|audio|signed).*url/i.test(arg) || /url.*(image|video|audio|signed)/i.test(arg)
}

function main() {
  const targetExpr = TARGETS.join(' ')

  // 规则 1：业务代码中不允许直接调用 extractCOSKey（统一走 resolveStorageKeyFromMediaValue）
  const extractOutput = run(`rg -n "extractCOSKey\\\\(" ${targetExpr}`)
  const extractLines = parseLines(extractOutput)
  const extractViolations = extractLines.filter((line) => {
    const file = getFile(line)
    return !EXTRACT_ALLOWLIST.has(file)
  })

  // 规则 2：媒体相关 fetch 必须包裹 toFetchableUrl
  const fetchOutput = run(`rg -n "fetch\\\\(" ${targetExpr}`)
  const fetchLines = parseLines(fetchOutput)
  const fetchViolations = fetchLines.filter((line) => {
    const file = getFile(line)
    if (!FETCH_MEDIA_ALLOWLIST.has(file)) return false
    const code = getCode(line)
    const arg = extractFetchArg(code)
    if (!isMediaLikeFetchArg(arg)) return false
    return !isSafeFetchArg(arg)
  })

  const violations = [
    ...extractViolations.map((line) => `extractCOSKey forbidden: ${line}`),
    ...fetchViolations.map((line) => `fetch without toFetchableUrl: ${line}`),
  ]

  if (violations.length > 0) {
    process.stderr.write('[check:media-normalization] found violations:\n')
    for (const item of violations) {
      process.stderr.write(`- ${item}\n`)
    }
    process.exit(1)
  }

  process.stdout.write(
    `[check:media-normalization] ok extract_scanned=${extractLines.length} fetch_scanned=${fetchLines.length} allow_extract=${EXTRACT_ALLOWLIST.size} allow_fetch=${FETCH_MEDIA_ALLOWLIST.size}\n`,
  )
}

main()
