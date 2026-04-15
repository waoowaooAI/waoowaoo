import fs from 'fs'
import path from 'path'
import analyzeCharactersSkillPackage from '@skills/project-workflow/analyze-characters'
import analyzeLocationsSkillPackage from '@skills/project-workflow/analyze-locations'
import analyzePropsSkillPackage from '@skills/project-workflow/analyze-props'
import generateScreenplaySkillPackage from '@skills/project-workflow/generate-screenplay'
import generateVoiceLinesSkillPackage from '@skills/project-workflow/generate-voice-lines'
import planStoryboardPhase1SkillPackage from '@skills/project-workflow/plan-storyboard-phase1'
import refineActingSkillPackage from '@skills/project-workflow/refine-acting'
import refineCinematographySkillPackage from '@skills/project-workflow/refine-cinematography'
import refineStoryboardDetailSkillPackage from '@skills/project-workflow/refine-storyboard-detail'
import splitClipsSkillPackage from '@skills/project-workflow/split-clips'
import scriptToStoryboardWorkflowPackage from '@skills/project-workflow/workflows/script-to-storyboard'
import storyToScriptWorkflowPackage from '@skills/project-workflow/workflows/story-to-script'
import type {
  SkillCatalogEntry,
  SkillPackage,
  WorkflowPackage,
  WorkflowPackageId,
  WorkflowSkillId,
} from './types'
import {
  PROJECT_WORKFLOW_SKILL_IDS,
  PROJECT_WORKFLOW_IDS,
} from './project-workflow-machine'

const importedSkillPackages = [
  analyzeCharactersSkillPackage,
  analyzeLocationsSkillPackage,
  analyzePropsSkillPackage,
  splitClipsSkillPackage,
  generateScreenplaySkillPackage,
  planStoryboardPhase1SkillPackage,
  refineCinematographySkillPackage,
  refineActingSkillPackage,
  refineStoryboardDetailSkillPackage,
  generateVoiceLinesSkillPackage,
] satisfies SkillPackage[]

const importedWorkflowPackages = [
  storyToScriptWorkflowPackage,
  scriptToStoryboardWorkflowPackage,
] satisfies WorkflowPackage[]

function buildOrderedPackageRecord<TId extends string, TPackage>(
  expectedIds: TId[],
  packages: TPackage[],
  resolveId: (pkg: TPackage) => TId,
): Record<TId, TPackage> {
  if (packages.length !== expectedIds.length) {
    throw new Error(`Package registry length mismatch. expected=${expectedIds.length} actual=${packages.length}`)
  }

  const packageMap = new Map<TId, TPackage>()
  for (const pkg of packages) {
    const id = resolveId(pkg)
    if (!expectedIds.includes(id)) {
      throw new Error(`Package registry contains unexpected id: ${id}`)
    }
    if (packageMap.has(id)) {
      throw new Error(`Package registry contains duplicate id: ${id}`)
    }
    packageMap.set(id, pkg)
  }

  const orderedEntries = expectedIds.map((id) => {
    const pkg = packageMap.get(id)
    if (!pkg) {
      throw new Error(`Package registry is missing id: ${id}`)
    }
    return [id, pkg] as const
  })

  return Object.fromEntries(orderedEntries) as Record<TId, TPackage>
}

const skillPackages = buildOrderedPackageRecord(
  PROJECT_WORKFLOW_SKILL_IDS,
  importedSkillPackages,
  (pkg) => pkg.metadata.id,
)

const workflowPackages = buildOrderedPackageRecord(
  PROJECT_WORKFLOW_IDS,
  importedWorkflowPackages,
  (pkg) => pkg.manifest.id,
)

function skillsRoot(): string {
  return path.resolve(process.cwd(), 'skills', 'project-workflow')
}

function walkFiles(rootDir: string): string[] {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const nextPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(nextPath))
      continue
    }
    files.push(nextPath)
  }
  return files
}

function relativeSkillPath(absolutePath: string): string {
  return path.relative(process.cwd(), absolutePath).replace(/\\/g, '/')
}

export function getSkillPackage(skillId: WorkflowSkillId): SkillPackage {
  return skillPackages[skillId]
}

export function listSkillPackages(): SkillPackage[] {
  return PROJECT_WORKFLOW_SKILL_IDS.map((skillId) => skillPackages[skillId])
}

export function getWorkflowPackage(workflowId: WorkflowPackageId): WorkflowPackage {
  return workflowPackages[workflowId]
}

export function listWorkflowPackages(): WorkflowPackage[] {
  return PROJECT_WORKFLOW_IDS.map((workflowId) => workflowPackages[workflowId])
}

export function findWorkflowSkillPackageByLegacyStepId(stepId: string): SkillPackage | null {
  for (const skillPackage of Object.values(skillPackages)) {
    if (skillPackage.legacyStepIds.includes(stepId)) return skillPackage
  }
  return null
}

export function listSkillCatalogEntries(): SkillCatalogEntry[] {
  const skills = listSkillPackages().map((skillPackage) => ({
    id: skillPackage.metadata.id,
    kind: 'skill' as const,
    name: skillPackage.metadata.name,
    summary: skillPackage.metadata.summary,
    description: skillPackage.metadata.description,
    documentPath: skillPackage.instructions.documentPath,
  }))
  const workflows = listWorkflowPackages().map((workflowPackage) => ({
    id: workflowPackage.manifest.id,
    kind: 'workflow' as const,
    name: workflowPackage.manifest.name,
    summary: workflowPackage.manifest.summary,
    description: workflowPackage.manifest.description,
    documentPath: workflowPackage.documentPath,
  }))
  return [...workflows, ...skills]
}

export function discoverSkillDocuments(): Array<{ kind: 'skill' | 'workflow'; path: string }> {
  return walkFiles(skillsRoot())
    .filter((filePath) => filePath.endsWith('/SKILL.md') || filePath.endsWith('/WORKFLOW.md'))
    .map((filePath) => ({
      kind: filePath.endsWith('/SKILL.md') ? 'skill' as const : 'workflow' as const,
      path: relativeSkillPath(filePath),
    }))
}

export function readSkillCatalogDocument(documentPath: string): string {
  const filePath = path.resolve(process.cwd(), documentPath)
  return fs.readFileSync(filePath, 'utf8').trim()
}
