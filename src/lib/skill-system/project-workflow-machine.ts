import { TASK_TYPE } from '@/lib/task/types'
import type {
  SkillPackageInstructions,
  SkillPackageMetadata,
  WorkflowPackageId,
  WorkflowPackageManifest,
  WorkflowSkillId,
  WorkflowStepDefinition,
} from './types'

type ProjectSkillMachine = {
  metadata: SkillPackageMetadata
  instructions: SkillPackageInstructions
  legacyStepIds: string[]
  displayLabel: string
}

type ProjectWorkflowMachine = {
  manifest: WorkflowPackageManifest
  documentPath: string
  displayLabel: string
  approvalSummary: string
  steps: WorkflowStepDefinition[]
}

export const PROJECT_WORKFLOW_SKILL_IDS: WorkflowSkillId[] = [
  'analyze-characters',
  'analyze-locations',
  'analyze-props',
  'split-clips',
  'generate-screenplay',
  'plan-storyboard-phase1',
  'refine-cinematography',
  'refine-acting',
  'refine-storyboard-detail',
  'generate-voice-lines',
]

export const PROJECT_WORKFLOW_IDS: WorkflowPackageId[] = [
  'story-to-script',
  'script-to-storyboard',
]

export const PROJECT_WORKFLOW_SKILL_MACHINE: Record<WorkflowSkillId, ProjectSkillMachine> = {
  'analyze-characters': {
    metadata: {
      id: 'analyze-characters',
      name: 'Analyze Characters',
      summary: 'Extract normalized characters from story text.',
      description: 'Run the character analysis pass and produce structured character artifacts.',
      riskLevel: 'low',
      scope: 'episode',
    },
    instructions: {
      documentPath: 'skills/project-workflow/analyze-characters/SKILL.md',
    },
    legacyStepIds: ['analyze_characters'],
    displayLabel: '角色分析',
  },
  'analyze-locations': {
    metadata: {
      id: 'analyze-locations',
      name: 'Analyze Locations',
      summary: 'Extract normalized locations from story text.',
      description: 'Run the location analysis pass and produce structured location artifacts.',
      riskLevel: 'low',
      scope: 'episode',
    },
    instructions: {
      documentPath: 'skills/project-workflow/analyze-locations/SKILL.md',
    },
    legacyStepIds: ['analyze_locations'],
    displayLabel: '场景分析',
  },
  'analyze-props': {
    metadata: {
      id: 'analyze-props',
      name: 'Analyze Props',
      summary: 'Extract normalized props from story text.',
      description: 'Run the prop analysis pass and produce structured prop artifacts.',
      riskLevel: 'low',
      scope: 'episode',
    },
    instructions: {
      documentPath: 'skills/project-workflow/analyze-props/SKILL.md',
    },
    legacyStepIds: ['analyze_props'],
    displayLabel: '道具分析',
  },
  'split-clips': {
    metadata: {
      id: 'split-clips',
      name: 'Split Clips',
      summary: 'Split story text into ordered clip units.',
      description: 'Use upstream analysis artifacts to produce valid clip boundaries and summaries.',
      riskLevel: 'low',
      scope: 'episode',
    },
    instructions: {
      documentPath: 'skills/project-workflow/split-clips/SKILL.md',
    },
    legacyStepIds: ['split_clips'],
    displayLabel: '片段切分',
  },
  'generate-screenplay': {
    metadata: {
      id: 'generate-screenplay',
      name: 'Generate Screenplay',
      summary: 'Generate screenplay scenes for each clip.',
      description: 'Transform split clips into screenplay scene JSON while preserving upstream analysis context.',
      riskLevel: 'low',
      scope: 'episode',
    },
    instructions: {
      documentPath: 'skills/project-workflow/generate-screenplay/SKILL.md',
    },
    legacyStepIds: ['generate_screenplay'],
    displayLabel: '剧本生成',
  },
  'plan-storyboard-phase1': {
    metadata: {
      id: 'plan-storyboard-phase1',
      name: 'Plan Storyboard Phase 1',
      summary: 'Create first-pass storyboard panels from screenplay clips.',
      description: 'Generate the initial storyboard plan per clip.',
      riskLevel: 'medium',
      scope: 'episode',
    },
    instructions: {
      documentPath: 'skills/project-workflow/plan-storyboard-phase1/SKILL.md',
    },
    legacyStepIds: ['plan_storyboard_phase1'],
    displayLabel: '分镜规划',
  },
  'refine-cinematography': {
    metadata: {
      id: 'refine-cinematography',
      name: 'Refine Cinematography',
      summary: 'Add cinematography rules to storyboard panels.',
      description: 'Generate per-panel camera and photography rules.',
      riskLevel: 'medium',
      scope: 'episode',
    },
    instructions: {
      documentPath: 'skills/project-workflow/refine-cinematography/SKILL.md',
    },
    legacyStepIds: ['refine_cinematography'],
    displayLabel: '摄影规则',
  },
  'refine-acting': {
    metadata: {
      id: 'refine-acting',
      name: 'Refine Acting',
      summary: 'Add acting direction to storyboard panels.',
      description: 'Generate per-panel acting notes after phase 1 planning.',
      riskLevel: 'medium',
      scope: 'episode',
    },
    instructions: {
      documentPath: 'skills/project-workflow/refine-acting/SKILL.md',
    },
    legacyStepIds: ['refine_acting'],
    displayLabel: '表演指导',
  },
  'refine-storyboard-detail': {
    metadata: {
      id: 'refine-storyboard-detail',
      name: 'Refine Storyboard Detail',
      summary: 'Produce the final detailed storyboard panel set.',
      description: 'Merge phase-1 panels with phase-2 guidance into detailed final panels.',
      riskLevel: 'medium',
      scope: 'episode',
    },
    instructions: {
      documentPath: 'skills/project-workflow/refine-storyboard-detail/SKILL.md',
    },
    legacyStepIds: ['refine_storyboard_detail'],
    displayLabel: '镜头细化',
  },
  'generate-voice-lines': {
    metadata: {
      id: 'generate-voice-lines',
      name: 'Generate Voice Lines',
      summary: 'Generate voice lines aligned to final storyboard panels.',
      description: 'Create structured voice lines from the final storyboard output.',
      riskLevel: 'medium',
      scope: 'episode',
    },
    instructions: {
      documentPath: 'skills/project-workflow/generate-voice-lines/SKILL.md',
    },
    legacyStepIds: ['generate_voice_lines', 'voice_analyze'],
    displayLabel: '台词生成',
  },
}

export const PROJECT_WORKFLOW_MACHINE: Record<WorkflowPackageId, ProjectWorkflowMachine> = {
  'story-to-script': {
    manifest: {
      id: 'story-to-script',
      name: 'Story To Script',
      summary: 'Analyze story content and generate screenplay artifacts in a fixed sequence.',
      description: 'Fixed workflow package for the story -> screenplay pipeline.',
      taskType: TASK_TYPE.STORY_TO_SCRIPT_RUN,
      workflowType: TASK_TYPE.STORY_TO_SCRIPT_RUN,
      requiresApproval: true,
    },
    documentPath: 'skills/project-workflow/workflows/story-to-script/WORKFLOW.md',
    displayLabel: '故事到剧本',
    approvalSummary: '该流程会重新分析故事内容，并生成新的剧本结果。',
    steps: [
      {
        orderIndex: 0,
        skillId: 'analyze-characters',
        title: 'Analyze Characters',
        dependsOn: [],
        executionKind: 'serial',
        scopeCollection: 'episode',
      },
      {
        orderIndex: 1,
        skillId: 'analyze-locations',
        title: 'Analyze Locations',
        dependsOn: ['analyze-characters'],
        executionKind: 'serial',
        scopeCollection: 'episode',
      },
      {
        orderIndex: 2,
        skillId: 'analyze-props',
        title: 'Analyze Props',
        dependsOn: ['analyze-locations'],
        executionKind: 'serial',
        scopeCollection: 'episode',
      },
      {
        orderIndex: 3,
        skillId: 'split-clips',
        title: 'Split Clips',
        dependsOn: ['analyze-props'],
        executionKind: 'serial',
        scopeCollection: 'episode',
      },
      {
        orderIndex: 4,
        skillId: 'generate-screenplay',
        title: 'Generate Screenplay',
        dependsOn: ['split-clips'],
        executionKind: 'serial',
        scopeCollection: 'episode',
      },
    ],
  },
  'script-to-storyboard': {
    manifest: {
      id: 'script-to-storyboard',
      name: 'Script To Storyboard',
      summary: 'Transform screenplay clips into storyboard and voice artifacts in a fixed sequence.',
      description: 'Fixed workflow package for screenplay -> storyboard conversion.',
      taskType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      workflowType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      requiresApproval: true,
    },
    documentPath: 'skills/project-workflow/workflows/script-to-storyboard/WORKFLOW.md',
    displayLabel: '剧本到分镜',
    approvalSummary: '该流程会基于剧本重新生成分镜与台词结果。',
    steps: [
      {
        orderIndex: 0,
        skillId: 'plan-storyboard-phase1',
        title: 'Plan Storyboard Phase 1',
        dependsOn: [],
        executionKind: 'map',
        scopeCollection: 'clips',
      },
      {
        orderIndex: 1,
        skillId: 'refine-cinematography',
        title: 'Refine Cinematography',
        dependsOn: ['plan-storyboard-phase1'],
        executionKind: 'map',
        scopeCollection: 'clips',
      },
      {
        orderIndex: 2,
        skillId: 'refine-acting',
        title: 'Refine Acting',
        dependsOn: ['refine-cinematography'],
        executionKind: 'map',
        scopeCollection: 'clips',
      },
      {
        orderIndex: 3,
        skillId: 'refine-storyboard-detail',
        title: 'Refine Storyboard Detail',
        dependsOn: ['refine-acting'],
        executionKind: 'map',
        scopeCollection: 'clips',
      },
      {
        orderIndex: 4,
        skillId: 'generate-voice-lines',
        title: 'Generate Voice Lines',
        dependsOn: ['refine-storyboard-detail'],
        executionKind: 'join',
        scopeCollection: 'episode',
      },
    ],
  },
}

export function getProjectSkillMachine(skillId: WorkflowSkillId) {
  return PROJECT_WORKFLOW_SKILL_MACHINE[skillId]
}

export function getProjectWorkflowMachine(workflowId: WorkflowPackageId) {
  return PROJECT_WORKFLOW_MACHINE[workflowId]
}

export function getSkillDisplayLabel(skillId: string | null | undefined): string {
  if (!skillId) return '未命名技能'
  if (skillId in PROJECT_WORKFLOW_SKILL_MACHINE) {
    return PROJECT_WORKFLOW_SKILL_MACHINE[skillId as WorkflowSkillId].displayLabel
  }
  return skillId
}

export function getWorkflowDisplayLabel(workflowId: WorkflowPackageId): string {
  return PROJECT_WORKFLOW_MACHINE[workflowId].displayLabel
}
