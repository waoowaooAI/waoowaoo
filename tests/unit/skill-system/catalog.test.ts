import { describe, expect, it } from 'vitest'
import {
  PROJECT_WORKFLOW_SKILL_IDS,
  PROJECT_WORKFLOW_IDS,
} from '@/lib/skill-system/project-workflow-machine'
import {
  discoverSkillDocuments,
  getWorkflowPackage,
  listSkillCatalogEntries,
  listSkillPackages,
  listWorkflowPackages,
  readSkillCatalogDocument,
} from '@/lib/skill-system/catalog'

describe('skill-system catalog', () => {
  it('discovers first-phase skills and workflow packages from skills directory', () => {
    const skillPackages = listSkillPackages()
    const workflowPackages = listWorkflowPackages()
    const documents = discoverSkillDocuments()

    expect(skillPackages.map((pkg) => pkg.metadata.id)).toEqual(PROJECT_WORKFLOW_SKILL_IDS)
    expect(workflowPackages.map((pkg) => pkg.manifest.id)).toEqual(PROJECT_WORKFLOW_IDS)
    expect(documents.map((item) => item.path)).toContain('skills/project-workflow/analyze-characters/SKILL.md')
    expect(documents.map((item) => item.path)).toContain('skills/project-workflow/workflows/story-to-script/WORKFLOW.md')
  })

  it('story-to-script workflow package uses fixed serial skill order', () => {
    const workflowPackage = getWorkflowPackage('story-to-script')

    expect(workflowPackage.steps.map((step) => step.skillId)).toEqual([
      'analyze-characters',
      'analyze-locations',
      'analyze-props',
      'split-clips',
      'generate-screenplay',
    ])
    expect(workflowPackage.manifest.requiresApproval).toBe(true)
    expect(workflowPackage.steps.every((step) => step.executionKind === 'serial')).toBe(true)
  })

  it('script-to-storyboard workflow package exposes clip fan-out and episode join metadata', () => {
    const workflowPackage = getWorkflowPackage('script-to-storyboard')

    expect(workflowPackage.steps.map((step) => ({
      skillId: step.skillId,
      executionKind: step.executionKind,
      scopeCollection: step.scopeCollection,
    }))).toEqual([
      {
        skillId: 'plan-storyboard-phase1',
        executionKind: 'map',
        scopeCollection: 'clips',
      },
      {
        skillId: 'refine-cinematography',
        executionKind: 'map',
        scopeCollection: 'clips',
      },
      {
        skillId: 'refine-acting',
        executionKind: 'map',
        scopeCollection: 'clips',
      },
      {
        skillId: 'refine-storyboard-detail',
        executionKind: 'map',
        scopeCollection: 'clips',
      },
      {
        skillId: 'generate-voice-lines',
        executionKind: 'join',
        scopeCollection: 'episode',
      },
    ])
  })

  it('reads skill document content from repository source files', () => {
    const catalogEntries = listSkillCatalogEntries()
    const storyWorkflow = catalogEntries.find((entry) => entry.id === 'story-to-script')
    expect(storyWorkflow).toBeTruthy()

    const content = readSkillCatalogDocument(storyWorkflow!.documentPath)
    expect(content).toContain('Fixed Skill Order')
    expect(content).toContain('analyze-characters')
  })
})
