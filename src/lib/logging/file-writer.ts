/**
 * Server-side log file writer.
 *
 * Routes log events to per-project log files following the naming convention:
 *   - `admin_{projectName}.log`    – API / user-facing operations
 *   - `Internal_{projectName}.log` – worker / internal operations
 *
 * This module is Edge-safe at import-time: all Node.js APIs are accessed via
 * async dynamic `import('node:fs')` calls that only run at write-time.
 *
 * The writer is intentionally fire-and-forget: callers should never await it
 * and logging failures should never crash the application.
 */

// ─── environment guard ────────────────────────────────────────────────

function isEdgeOrBrowser(): boolean {
    if (typeof window !== 'undefined') return true
    const g = globalThis as { EdgeRuntime?: unknown }
    return typeof g.EdgeRuntime === 'string'
}

// ─── node module cache ────────────────────────────────────────────────
// We cache lazily so the module stays Edge-safe at import time.

type NodeModules = {
    fs: typeof import('node:fs')
    path: typeof import('node:path')
    cwd: string
}

let nodeModulesCache: NodeModules | null | 'pending' | undefined

async function getNodeModules(): Promise<NodeModules | null> {
    if (nodeModulesCache === null) return null
    if (nodeModulesCache && nodeModulesCache !== 'pending') return nodeModulesCache
    if (isEdgeOrBrowser()) {
        nodeModulesCache = null
        return null
    }

    // Only one concurrent initialisation
    if (nodeModulesCache === 'pending') {
        // Another call is already initialising – yield and retry
        await new Promise((r) => setTimeout(r, 0))
        return getNodeModules()
    }
    nodeModulesCache = 'pending'

    try {
        // 使用 new Function() 间接导入，绕过 Next.js 静态分析器的 Edge Runtime 检查。
        // 运行时行为与直接 import() 完全一致，但打包器不会静态追踪这些模块。
        const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>
        const [fs, path] = await Promise.all([
            dynamicImport('node:fs'),
            dynamicImport('node:path'),
        ]) as [typeof import('node:fs'), typeof import('node:path')]
        // process.cwd() 同理，用 new Function 包裹避免静态分析追踪
        const getCwd = new Function('return process.cwd()') as () => string
        const resolved: NodeModules = { fs, path, cwd: getCwd() }
        nodeModulesCache = resolved
        return resolved
    } catch {
        nodeModulesCache = null
        return null
    }
}

// ─── project-name cache ───────────────────────────────────────────────
const projectNameCache = new Map<string, string>()
const pendingLookups = new Set<string>()

/** Register a known projectId → projectName mapping. */
export function registerProjectName(projectId: string, projectName: string): void {
    if (projectId && projectName) {
        projectNameCache.set(projectId, projectName)
    }
}

/**
 * Resolve projectName from cache or DB.
 * Returns `null` if the name cannot be resolved right now.
 */
async function resolveProjectName(projectId: string): Promise<string | null> {
    const cached = projectNameCache.get(projectId)
    if (cached) return cached

    // Avoid duplicate concurrent lookups for the same projectId.
    if (pendingLookups.has(projectId)) return null
    pendingLookups.add(projectId)

    try {
        const { prisma } = await import('@/lib/prisma')
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { name: true },
        })
        if (project?.name) {
            projectNameCache.set(projectId, project.name)
            return project.name
        }
    } catch {
        // Swallow lookup errors – better to lose a log line than crash.
    } finally {
        pendingLookups.delete(projectId)
    }

    return null
}

// ─── file helpers ─────────────────────────────────────────────────────

/**
 * Sanitize a project name so it can be safely used as part of a file name.
 * Replaces characters that are invalid on macOS/Linux/Windows with '_'.
 */
function sanitizeProjectName(name: string): string {
    return name.replace(/[/\\:\0*?"<>|]/g, '_').trim() || 'unknown'
}

async function appendLineAsync(filePath: string, line: string): Promise<void> {
    const modules = await getNodeModules()
    if (!modules) return

    try {
        // Ensure the logs directory exists
        const dir = modules.path.dirname(filePath)
        modules.fs.mkdirSync(dir, { recursive: true })
        modules.fs.appendFileSync(filePath, line + '\n')
    } catch (err) {
        // Do not propagate, but surface so file-write failures are visible.
        console.error('[file-writer] Failed to write log line to', filePath, err)
    }
}

function buildLogFilePath(modules: NodeModules, prefix: string, projectName: string): string {
    const fileName = `${prefix}_${sanitizeProjectName(projectName)}.log`
    return modules.path.join(modules.cwd, 'logs', fileName)
}

// ─── prefix mapping ──────────────────────────────────────────────────

function getPrefix(module?: string): string {
    if (module && module.startsWith('worker')) return 'Internal'
    return 'admin'
}

// ─── buffered events ─────────────────────────────────────────────────
// When a log event arrives before the project name is resolved we buffer
// it so it can be flushed once the name becomes available.
const bufferedLines = new Map<string, string[]>()

async function flushBuffer(projectId: string, projectName: string): Promise<void> {
    const lines = bufferedLines.get(projectId)
    if (!lines || lines.length === 0) return
    bufferedLines.delete(projectId)

    const modules = await getNodeModules()
    if (!modules) return

    for (const entry of lines) {
        // The prefix was stored as a "|" delimited header: "prefix|json"
        const sepIdx = entry.indexOf('|')
        if (sepIdx === -1) continue
        const prefix = entry.slice(0, sepIdx)
        const json = entry.slice(sepIdx + 1)
        const filePath = buildLogFilePath(modules, prefix, projectName)
        void appendLineAsync(filePath, json)
    }
}

// ─── public API ──────────────────────────────────────────────────────

/**
 * Write a log line to the appropriate project log file.
 *
 * This function is fire-and-forget – the returned promise should be
 * `void`-ed by the caller.
 */
export async function writeLogToProjectFile(
    line: string,
    projectId: string | undefined,
    module: string | undefined,
): Promise<void> {
    if (isEdgeOrBrowser()) return
    if (!projectId) return

    const prefix = getPrefix(module)

    // Fast path – projectName already cached
    const cachedName = projectNameCache.get(projectId)
    if (cachedName) {
        const modules = await getNodeModules()
        if (!modules) return
        const filePath = buildLogFilePath(modules, prefix, cachedName)
        void appendLineAsync(filePath, line)
        return
    }

    // Slow path – resolve asynchronously
    const projectName = await resolveProjectName(projectId)
    if (projectName) {
        // Flush anything that was buffered while we were resolving
        void flushBuffer(projectId, projectName)
        const modules = await getNodeModules()
        if (!modules) return
        const filePath = buildLogFilePath(modules, prefix, projectName)
        void appendLineAsync(filePath, line)
        return
    }

    // Name not yet available – buffer the line
    const buf = bufferedLines.get(projectId) || []
    buf.push(`${prefix}|${line}`)
    bufferedLines.set(projectId, buf)
}

/**
 * Called when a project name becomes available to flush any buffered
 * log events for that project.
 */
export function onProjectNameAvailable(projectId: string, projectName: string): void {
    registerProjectName(projectId, projectName)
    void flushBuffer(projectId, projectName)
}
