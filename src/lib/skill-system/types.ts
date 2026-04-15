import type { ComponentType } from 'react'
import type { ZodTypeAny } from 'zod'
import type { ArtifactType } from '@/lib/artifact-system/types'

export type SkillRiskLevel = 'low' | 'medium' | 'high'
export type SkillMutationKind = 'read' | 'generate' | 'update' | 'delete'
export type SkillScopeKind = 'project' | 'episode' | 'clip' | 'panel'

export type WorkflowSkillId =
  | 'analyze-characters'
  | 'analyze-locations'
  | 'analyze-props'
  | 'split-clips'
  | 'generate-screenplay'
  | 'plan-storyboard-phase1'
  | 'refine-cinematography'
  | 'refine-acting'
  | 'refine-storyboard-detail'
  | 'generate-voice-lines'

export type WorkflowPackageId = 'story-to-script' | 'script-to-storyboard'

export type CommandSkillId =
  | WorkflowSkillId
  | 'insert_panel'
  | 'panel_variant'
  | 'regenerate_storyboard_text'
  | 'modify_shot_prompt'

export interface SkillPackageMetadata {
  id: WorkflowSkillId
  name: string
  summary: string
  description: string
  riskLevel: SkillRiskLevel
  scope: SkillScopeKind
}

export interface SkillPackageInstructions {
  documentPath: string
}

export interface SkillPackageInterface {
  inputSchema: ZodTypeAny
  outputSchema: ZodTypeAny
  inputArtifacts: ArtifactType[]
  outputArtifacts: ArtifactType[]
}

export interface SkillPackageResources {
  models: readonly string[]
  promptFiles: readonly string[]
  loaders: readonly string[]
  toolAllowlist: readonly string[]
}

export interface SkillPackageEffects {
  mutationKind: SkillMutationKind
  invalidates: ArtifactType[]
  requiresApproval: boolean
}

export interface SkillPackage {
  kind: 'skill'
  metadata: SkillPackageMetadata
  instructions: SkillPackageInstructions
  interface: SkillPackageInterface
  resources: SkillPackageResources
  effects: SkillPackageEffects
  legacyStepIds: string[]
  execute: (input: unknown) => Promise<unknown>
  render: ComponentType<{ data: unknown }>
}

export interface WorkflowStepDefinition {
  orderIndex: number
  skillId: WorkflowSkillId
  title: string
  dependsOn: WorkflowSkillId[]
  executionKind?: 'serial' | 'map' | 'join'
  scopeCollection?: 'episode' | 'clips'
}

export interface WorkflowPackageManifest {
  id: WorkflowPackageId
  name: string
  summary: string
  description: string
  taskType: string
  workflowType: string
  requiresApproval: boolean
}

export interface WorkflowPackage {
  kind: 'workflow'
  manifest: WorkflowPackageManifest
  documentPath: string
  inputSchema: ZodTypeAny
  outputSchema: ZodTypeAny
  steps: WorkflowStepDefinition[]
  execute: (input: unknown) => Promise<unknown>
  render: ComponentType<{ data: unknown }>
}

export interface SkillCatalogEntry {
  id: string
  kind: 'skill' | 'workflow'
  name: string
  summary: string
  description: string
  documentPath: string
}

export interface SkillDefinition {
  id: CommandSkillId
  name: string
  summary: string
  riskLevel: SkillRiskLevel
  requiresApproval: boolean
  inputArtifacts: ArtifactType[]
  outputArtifacts: ArtifactType[]
  invalidates: ArtifactType[]
  mutationKind: SkillMutationKind
  taskType?: string
}

export interface WorkflowPresetDefinition {
  id: WorkflowPackageId
  name: string
  summary: string
  workflowType: string
  taskType: string
  skillIds: WorkflowSkillId[]
  requiresApproval: boolean
}
