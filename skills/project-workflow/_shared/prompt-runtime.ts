import fs from 'node:fs'
import path from 'node:path'
import type { WorkflowSkillId } from '@/lib/skill-system/types'

export type SkillLocale = 'zh' | 'en'

const fileCache = new Map<string, string>()

function readCachedFile(filePath: string): string {
  const cached = fileCache.get(filePath)
  if (cached) return cached
  const content = fs.readFileSync(filePath, 'utf8')
  fileCache.set(filePath, content)
  return content
}

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---\n')) return markdown.trim()
  const closingIndex = markdown.indexOf('\n---\n', 4)
  if (closingIndex < 0) return markdown.trim()
  return markdown.slice(closingIndex + 5).trim()
}

function resolveSkillRoot(skillId: WorkflowSkillId): string {
  return path.resolve(process.cwd(), 'skills', 'project-workflow', skillId)
}

export function applyTemplate(template: string, replacements: Record<string, string>): string {
  let next = template
  for (const [key, value] of Object.entries(replacements)) {
    next = next.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return next
}

export function readSkillInstructions(skillId: WorkflowSkillId): string {
  const skillPath = path.join(resolveSkillRoot(skillId), 'SKILL.md')
  return stripFrontmatter(readCachedFile(skillPath))
}

export function readSkillPromptTemplate(skillId: WorkflowSkillId, locale: SkillLocale): string {
  const templatePath = path.join(resolveSkillRoot(skillId), 'prompts', `template.${locale}.txt`)
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Missing skill prompt file for ${skillId} (${locale}): ${templatePath}`)
  }
  return readCachedFile(templatePath).trim()
}

export function composeSkillPrompt(params: {
  skillId: WorkflowSkillId
  locale: SkillLocale
  replacements: Record<string, string>
}): string {
  const instructions = readSkillInstructions(params.skillId)
  const renderedTemplate = applyTemplate(
    readSkillPromptTemplate(params.skillId, params.locale),
    params.replacements,
  )
  return [
    '[Skill Instructions]',
    instructions,
    '[Execution Template]',
    renderedTemplate,
  ].join('\n\n')
}
