import { beforeEach, describe, expect, it } from 'vitest'
import { retryFailedStep } from '@/lib/run-runtime/service'
import { RUN_STATUS, RUN_STEP_STATUS } from '@/lib/run-runtime/types'
import { prisma } from '../../helpers/prisma'
import { resetBillingState } from '../../helpers/db-reset'
import { createTestUser } from '../../helpers/billing-fixtures'

describe('run runtime retryFailedStep invalidation', () => {
  beforeEach(async () => {
    await resetBillingState()
  })

  it('invalidates downstream story-to-script steps and artifacts', async () => {
    const user = await createTestUser()
    const run = await prisma.graphRun.create({
      data: {
        userId: user.id,
        projectId: 'project-retry-story',
        episodeId: 'episode-retry-story',
        workflowType: 'story_to_script_run',
        taskType: 'story_to_script_run',
        targetType: 'ProjectEpisode',
        targetId: 'episode-retry-story',
        status: RUN_STATUS.FAILED,
        queuedAt: new Date(),
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    })

    await prisma.graphStep.createMany({
      data: [
        {
          runId: run.id,
          stepKey: 'analyze_characters',
          stepTitle: 'Analyze Characters',
          status: RUN_STEP_STATUS.FAILED,
          currentAttempt: 1,
          stepIndex: 1,
          stepTotal: 5,
          startedAt: new Date(),
          finishedAt: new Date(),
          lastErrorCode: 'STEP_FAILED',
          lastErrorMessage: 'characters failed',
        },
        {
          runId: run.id,
          stepKey: 'analyze_locations',
          stepTitle: 'Analyze Locations',
          status: RUN_STEP_STATUS.COMPLETED,
          currentAttempt: 1,
          stepIndex: 2,
          stepTotal: 5,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
        {
          runId: run.id,
          stepKey: 'split_clips',
          stepTitle: 'Split Clips',
          status: RUN_STEP_STATUS.COMPLETED,
          currentAttempt: 1,
          stepIndex: 3,
          stepTotal: 5,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
        {
          runId: run.id,
          stepKey: 'screenplay_clip-a',
          stepTitle: 'Screenplay A',
          status: RUN_STEP_STATUS.COMPLETED,
          currentAttempt: 1,
          stepIndex: 4,
          stepTotal: 5,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
        {
          runId: run.id,
          stepKey: 'screenplay_clip-b',
          stepTitle: 'Screenplay B',
          status: RUN_STEP_STATUS.COMPLETED,
          currentAttempt: 1,
          stepIndex: 5,
          stepTotal: 5,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      ],
    })

    await prisma.graphArtifact.createMany({
      data: [
        {
          runId: run.id,
          stepKey: 'analyze_characters',
          artifactType: 'analysis.characters',
          refId: 'episode-retry-story',
          payload: { rows: [{ name: 'Hero' }] },
        },
        {
          runId: run.id,
          stepKey: 'analyze_locations',
          artifactType: 'analysis.locations',
          refId: 'episode-retry-story',
          payload: { rows: [{ name: 'City' }] },
        },
        {
          runId: run.id,
          stepKey: 'split_clips',
          artifactType: 'clips',
          refId: 'episode-retry-story',
          payload: { clips: [{ id: 'clip-a' }] },
        },
        {
          runId: run.id,
          stepKey: 'screenplay_clip-a',
          artifactType: 'screenplay.clip',
          refId: 'clip-a',
          payload: { scenes: [{ id: 1 }] },
        },
      ],
    })

    const retried = await retryFailedStep({
      runId: run.id,
      userId: user.id,
      stepKey: 'analyze_characters',
    })

    expect(retried?.retryAttempt).toBe(2)
    expect(retried?.invalidatedStepKeys.slice().sort()).toEqual([
      'analyze_characters',
      'screenplay_clip-a',
      'screenplay_clip-b',
      'split_clips',
    ])

    const steps = await prisma.graphStep.findMany({
      where: { runId: run.id },
      orderBy: { stepIndex: 'asc' },
    })
    const stepMap = new Map(steps.map((step) => [step.stepKey, step]))
    expect(stepMap.get('analyze_characters')).toMatchObject({
      status: RUN_STEP_STATUS.PENDING,
      currentAttempt: 2,
      lastErrorCode: null,
      lastErrorMessage: null,
    })
    expect(stepMap.get('split_clips')).toMatchObject({
      status: RUN_STEP_STATUS.PENDING,
      currentAttempt: 0,
    })
    expect(stepMap.get('screenplay_clip-a')).toMatchObject({
      status: RUN_STEP_STATUS.PENDING,
      currentAttempt: 0,
    })
    expect(stepMap.get('analyze_locations')).toMatchObject({
      status: RUN_STEP_STATUS.COMPLETED,
      currentAttempt: 1,
    })

    const artifacts = await prisma.graphArtifact.findMany({
      where: { runId: run.id },
      orderBy: { stepKey: 'asc' },
    })
    expect(artifacts.map((artifact) => artifact.stepKey)).toEqual(['analyze_locations'])

    const refreshedRun = await prisma.graphRun.findUnique({ where: { id: run.id } })
    expect(refreshedRun?.status).toBe(RUN_STATUS.RUNNING)
    expect(refreshedRun?.errorCode).toBeNull()
    expect(refreshedRun?.errorMessage).toBeNull()
  })

  it('invalidates only the dependent storyboard branch plus voice analyze', async () => {
    const user = await createTestUser()
    const run = await prisma.graphRun.create({
      data: {
        userId: user.id,
        projectId: 'project-retry-storyboard',
        episodeId: 'episode-retry-storyboard',
        workflowType: 'script_to_storyboard_run',
        taskType: 'script_to_storyboard_run',
        targetType: 'ProjectEpisode',
        targetId: 'episode-retry-storyboard',
        status: RUN_STATUS.FAILED,
        queuedAt: new Date(),
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    })

    await prisma.graphStep.createMany({
      data: [
        {
          runId: run.id,
          stepKey: 'clip_clip-1_phase1',
          stepTitle: 'Clip 1 Phase 1',
          status: RUN_STEP_STATUS.FAILED,
          currentAttempt: 1,
          stepIndex: 1,
          stepTotal: 6,
          startedAt: new Date(),
          finishedAt: new Date(),
          lastErrorCode: 'STEP_FAILED',
          lastErrorMessage: 'phase1 failed',
        },
        {
          runId: run.id,
          stepKey: 'clip_clip-1_phase2_cinematography',
          stepTitle: 'Clip 1 Phase 2 Cine',
          status: RUN_STEP_STATUS.COMPLETED,
          currentAttempt: 1,
          stepIndex: 2,
          stepTotal: 6,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
        {
          runId: run.id,
          stepKey: 'clip_clip-1_phase2_acting',
          stepTitle: 'Clip 1 Phase 2 Acting',
          status: RUN_STEP_STATUS.COMPLETED,
          currentAttempt: 1,
          stepIndex: 3,
          stepTotal: 6,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
        {
          runId: run.id,
          stepKey: 'clip_clip-1_phase3_detail',
          stepTitle: 'Clip 1 Phase 3',
          status: RUN_STEP_STATUS.COMPLETED,
          currentAttempt: 1,
          stepIndex: 4,
          stepTotal: 6,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
        {
          runId: run.id,
          stepKey: 'clip_clip-2_phase3_detail',
          stepTitle: 'Clip 2 Phase 3',
          status: RUN_STEP_STATUS.COMPLETED,
          currentAttempt: 1,
          stepIndex: 5,
          stepTotal: 6,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
        {
          runId: run.id,
          stepKey: 'voice_analyze',
          stepTitle: 'Voice Analyze',
          status: RUN_STEP_STATUS.COMPLETED,
          currentAttempt: 1,
          stepIndex: 6,
          stepTotal: 6,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      ],
    })

    await prisma.graphArtifact.createMany({
      data: [
        {
          runId: run.id,
          stepKey: 'clip_clip-1_phase1',
          artifactType: 'storyboard.clip.phase1',
          refId: 'clip-1',
          payload: { panels: [] },
        },
        {
          runId: run.id,
          stepKey: 'clip_clip-1_phase2_cinematography',
          artifactType: 'storyboard.clip.phase2.cine',
          refId: 'clip-1',
          payload: { rules: [] },
        },
        {
          runId: run.id,
          stepKey: 'clip_clip-2_phase3_detail',
          artifactType: 'storyboard.clip.phase3',
          refId: 'clip-2',
          payload: { panels: [] },
        },
        {
          runId: run.id,
          stepKey: 'voice_analyze',
          artifactType: 'voice.lines',
          refId: 'episode-retry-storyboard',
          payload: { lines: [] },
        },
      ],
    })

    const retried = await retryFailedStep({
      runId: run.id,
      userId: user.id,
      stepKey: 'clip_clip-1_phase1',
    })

    expect(retried?.retryAttempt).toBe(2)
    expect(retried?.invalidatedStepKeys.slice().sort()).toEqual([
      'clip_clip-1_phase1',
      'clip_clip-1_phase2_acting',
      'clip_clip-1_phase2_cinematography',
      'clip_clip-1_phase3_detail',
      'voice_analyze',
    ])

    const steps = await prisma.graphStep.findMany({
      where: { runId: run.id },
      orderBy: { stepIndex: 'asc' },
    })
    const stepMap = new Map(steps.map((step) => [step.stepKey, step]))
    expect(stepMap.get('clip_clip-1_phase1')).toMatchObject({
      status: RUN_STEP_STATUS.PENDING,
      currentAttempt: 2,
    })
    expect(stepMap.get('clip_clip-1_phase2_cinematography')).toMatchObject({
      status: RUN_STEP_STATUS.PENDING,
      currentAttempt: 0,
    })
    expect(stepMap.get('voice_analyze')).toMatchObject({
      status: RUN_STEP_STATUS.PENDING,
      currentAttempt: 0,
    })
    expect(stepMap.get('clip_clip-2_phase3_detail')).toMatchObject({
      status: RUN_STEP_STATUS.COMPLETED,
      currentAttempt: 1,
    })

    const artifacts = await prisma.graphArtifact.findMany({
      where: { runId: run.id },
      orderBy: { stepKey: 'asc' },
    })
    expect(artifacts.map((artifact) => artifact.stepKey)).toEqual(['clip_clip-2_phase3_detail'])
  })
})
