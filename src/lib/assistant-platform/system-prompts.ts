import fs from 'fs'
import path from 'path'

export type AssistantPromptId = 'api-config-template' | 'tutorial'

const PROMPT_FILE_BY_ID: Record<AssistantPromptId, string> = {
  'api-config-template': 'api-config-template.system.txt',
  tutorial: 'tutorial.system.txt',
}

const promptCache = new Map<AssistantPromptId, string>()

function loadPromptTemplate(promptId: AssistantPromptId): string {
  const cached = promptCache.get(promptId)
  if (cached) return cached

  const fileName = PROMPT_FILE_BY_ID[promptId]
  const filePath = path.resolve(process.cwd(), 'lib', 'prompts', 'skills', fileName)
  if (!fs.existsSync(filePath)) {
    throw new Error(`ASSISTANT_SYSTEM_PROMPT_FILE_MISSING: ${filePath}`)
  }

  const content = fs.readFileSync(filePath, 'utf8').trim()
  if (!content) {
    throw new Error(`ASSISTANT_SYSTEM_PROMPT_EMPTY: ${filePath}`)
  }

  promptCache.set(promptId, content)
  return content
}

function replacePromptVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, keyRaw: string) => {
    const key = keyRaw.trim()
    return vars[key] || ''
  })
}

export function renderAssistantSystemPrompt(
  promptId: AssistantPromptId,
  vars?: Record<string, string>,
): string {
  const template = loadPromptTemplate(promptId)
  if (!vars || Object.keys(vars).length === 0) return template
  return replacePromptVariables(template, vars)
}
