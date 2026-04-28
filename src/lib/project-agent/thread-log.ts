import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { UIMessage } from 'ai'
import type { ProjectAssistantThreadSnapshot } from './types'

type UnknownObject = { [key: string]: unknown }

interface SerializeWorkspaceAssistantThreadLogInput {
  thread: ProjectAssistantThreadSnapshot
}

function sanitizeFileNameSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_') || 'unknown'
}

function isRecord(value: unknown): value is UnknownObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function formatJsonBlock(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
}

function renderPart(part: unknown): string[] {
  if (!isRecord(part)) return ['- unsupported part']
  const partType = readString(part.type)

  if (partType === 'text') {
    const text = readString(part.text).trim()
    return text ? [text] : ['- empty text']
  }

  if (partType === 'reasoning') {
    const text = readString(part.text).trim()
    return text ? ['### Reasoning', text] : ['### Reasoning', '- empty reasoning']
  }

  if (partType.startsWith('tool-') || partType === 'dynamic-tool') {
    const toolName = readString(part.toolName) || partType.replace(/^tool-/, '')
    const lines = [
      `### Tool ${toolName}`,
      `- state: ${readString(part.state) || 'unknown'}`,
      '#### Arguments',
      formatJsonBlock(part.input ?? part.args ?? {}),
    ]
    if ('output' in part) {
      lines.push('#### Result')
      lines.push(formatJsonBlock(part.output))
    }
    const errorText = readString(part.errorText).trim()
    if (errorText) {
      lines.push('#### Error')
      lines.push(errorText)
    }
    return lines
  }

  if (partType.startsWith('data-')) {
    return [
      `### ${partType}`,
      formatJsonBlock(part.data ?? null),
    ]
  }

  return [
    `### ${partType || 'unknown-part'}`,
    formatJsonBlock(part),
  ]
}

function renderMessage(message: UIMessage, messageIndex: number): string {
  const title = `## ${String(messageIndex + 1).padStart(2, '0')} ${message.role.toUpperCase()}`
  const renderedParts = message.parts.flatMap((part) => renderPart(part))
  return [title, ...renderedParts].join('\n\n')
}

export function buildWorkspaceAssistantThreadLogFileName(thread: ProjectAssistantThreadSnapshot): string {
  return [
    'workspace-assistant',
    sanitizeFileNameSegment(thread.projectId),
    sanitizeFileNameSegment(thread.scopeRef),
    `${sanitizeFileNameSegment(thread.id)}.log`,
  ].join('__')
}

export function serializeWorkspaceAssistantThreadLog(
  input: SerializeWorkspaceAssistantThreadLogInput,
): string {
  const { thread } = input
  const header = [
    '# Workspace Assistant Thread Log',
    '',
    `- assistantId: ${thread.assistantId}`,
    `- threadId: ${thread.id}`,
    `- projectId: ${thread.projectId}`,
    `- episodeId: ${thread.episodeId || 'global'}`,
    `- scopeRef: ${thread.scopeRef}`,
    `- createdAt: ${thread.createdAt}`,
    `- updatedAt: ${thread.updatedAt}`,
    '',
    '---',
    '',
  ]
  const sections = thread.messages.map((message, index) => renderMessage(message, index))
  return [...header, ...sections].join('\n')
}

export async function writeWorkspaceAssistantThreadLog(thread: ProjectAssistantThreadSnapshot): Promise<string> {
  const logsDir = path.join(process.cwd(), 'logs')
  const fileName = buildWorkspaceAssistantThreadLogFileName(thread)
  const filePath = path.join(logsDir, fileName)
  await mkdir(logsDir, { recursive: true })
  await writeFile(filePath, serializeWorkspaceAssistantThreadLog({ thread }), 'utf8')
  return filePath
}
