import type { OpenAICompatMediaTemplate } from '@/lib/openai-compat-media-template'
import {
  parseOpenAICompatMediaTemplate,
  type ModelTemplateValidationIssue,
} from './schema'

function hasHttpProtocol(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://')
}

function isRelativePath(path: string): boolean {
  return path.startsWith('/')
}

function validatePath(path: string, field: string): ModelTemplateValidationIssue | null {
  const trimmed = path.trim()
  if (!trimmed) {
    return {
      code: 'MODEL_TEMPLATE_INVALID',
      field,
      message: 'path must be non-empty',
    }
  }

  if (!hasHttpProtocol(trimmed) && !isRelativePath(trimmed)) {
    return {
      code: 'MODEL_TEMPLATE_INVALID',
      field,
      message: 'path must be absolute URL or relative path',
    }
  }
  return null
}

function validateEndpointPaths(template: OpenAICompatMediaTemplate): ModelTemplateValidationIssue[] {
  const issues: ModelTemplateValidationIssue[] = []
  const createPathIssue = validatePath(template.create.path, 'create.path')
  if (createPathIssue) issues.push(createPathIssue)
  if (template.status) {
    const statusPathIssue = validatePath(template.status.path, 'status.path')
    if (statusPathIssue) issues.push(statusPathIssue)
  }
  if (template.content) {
    const contentPathIssue = validatePath(template.content.path, 'content.path')
    if (contentPathIssue) issues.push(contentPathIssue)
  }
  return issues
}

export function validateOpenAICompatMediaTemplate(raw: unknown): {
  ok: boolean
  template: OpenAICompatMediaTemplate | null
  issues: ModelTemplateValidationIssue[]
} {
  const parsed = parseOpenAICompatMediaTemplate(raw)
  if (!parsed.template) {
    return { ok: false, template: null, issues: parsed.issues }
  }
  const endpointIssues = validateEndpointPaths(parsed.template)
  if (endpointIssues.length > 0) {
    return {
      ok: false,
      template: null,
      issues: [...parsed.issues, ...endpointIssues],
    }
  }
  return { ok: true, template: parsed.template, issues: [] }
}

