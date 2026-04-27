/**
 * 共享：guard legacy allowlist 的 JSON 快照机制。
 *
 * - guard 调用 loadAllowlist(name) 拿到当前快照。
 * - guard 主入口接收 --update-snapshot 标志后，调用 writeAllowlist(name, list) 覆盖。
 * - 快照文件位于 scripts/guards/snapshots/<name>.json
 * - 文件格式：{ "files": ["src/a.ts", ...], "generatedAt": "...", "note": "..." }
 *
 * 规则（人工 review 时必须遵守）：
 * - 完成迁移后，files 数组**只能缩短**，禁止新增。
 * - 任何 PR 内 files 数组新增项 = 阻塞。
 *   通过 `git diff --shortstat scripts/guards/snapshots/<name>.json` 在 CI 二次审计。
 */

import fs from 'node:fs'
import path from 'node:path'

const SNAPSHOT_DIR = path.join(process.cwd(), 'scripts/guards/snapshots')

export function loadAllowlist(name) {
  const file = path.join(SNAPSHOT_DIR, `${name}.json`)
  if (!fs.existsSync(file)) return new Set()
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(json.files)) throw new Error(`snapshot ${file} missing files[]`)
  return new Set(json.files)
}

export function writeAllowlist(name, files, note) {
  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true })
  const sorted = [...new Set(files)].sort()
  const file = path.join(SNAPSHOT_DIR, `${name}.json`)
  const payload = {
    note: note || 'Legacy allowlist for AI refactor; only allowed to shrink.',
    generatedAt: new Date().toISOString(),
    files: sorted,
  }
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  return file
}

export function hasUpdateFlag(argv) {
  return argv.includes('--update-snapshot')
}
