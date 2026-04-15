---
name: script-to-storyboard
description: Fixed serial workflow package that converts screenplay clips into storyboard and voice artifacts.
---

# Script To Storyboard Workflow

## Purpose

Run the canonical storyboard generation pipeline for project workflows. This workflow is fixed-order and serial because each stage depends on artifacts produced by earlier stages.

## Use This Workflow When

- Valid screenplay clips already exist and the project needs storyboard output.
- Screenplay or storyboard upstream state changed and storyboard artifacts must be regenerated cleanly.
- A user explicitly requests the screenplay-to-storyboard flow from the assistant or GUI.

## Do Not Use This Workflow When

- Screenplay artifacts are missing.
- The caller only needs one isolated storyboard refinement skill.
- The project only needs media regeneration from an already valid final panel set.

## Fixed Skill Order

1. `plan-storyboard-phase1`
2. `refine-cinematography`
3. `refine-acting`
4. `refine-storyboard-detail`
5. `generate-voice-lines`

## Serial Execution Contract

- The order is fixed and must not be reordered by the agent.
- Each step depends on the artifact written by the previous step or phase.
- Any step failure stops the workflow immediately.
- No stage may silently skip clips or panels to keep the workflow moving.

## Inputs

- Screenplay clips
- Novel-promotion analysis context
- Story text
- Workflow locale, which selects each internal skill's owned prompt files

## Outputs

- `storyboard.phase1`
- `storyboard.phase2.cinematography`
- `storyboard.phase2.acting`
- `storyboard.phase3.detail`
- `storyboard.panel_set`
- `voice.lines`
- Workflow summary for UI preview and run history

## Approval

- Approval is required before execution.
- Reason: this workflow can overwrite storyboard, voice, and downstream media-generation artifacts.

## Failure Policy

- No step may be skipped or reordered.
- Any missing upstream artifact, schema mismatch, or alignment failure stops the workflow.
- No implicit fallback or placeholder output is allowed.

## UI Expectations

- The assistant should show this workflow as one package with nested skill progress.
- The active skill, completed skills, and final storyboard preview should all be visible in the left panel timeline.
