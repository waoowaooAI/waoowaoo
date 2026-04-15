---
name: story-to-script
description: Fixed serial workflow package that converts story text into structured screenplay artifacts.
---

# Story To Script Workflow

## Purpose

Run the canonical story analysis and screenplay generation pipeline for project workflows. This workflow is fixed-order and serial because each downstream skill consumes the previous skill's artifact output.

## Use This Workflow When

- Raw story text is ready to be converted into screenplay artifacts.
- Story text changed and the screenplay pipeline must be regenerated from fresh analysis.
- A user explicitly requests the story-to-script flow from the assistant or GUI.

## Do Not Use This Workflow When

- The caller only needs one isolated skill refresh.
- Story text is missing or incomplete.
- The project only needs storyboard regeneration from an already valid screenplay artifact.

## Fixed Skill Order

1. `analyze-characters`
2. `analyze-locations`
3. `analyze-props`
4. `split-clips`
5. `generate-screenplay`

## Serial Execution Contract

- The order is fixed and must not be reordered by the agent.
- A later skill may only start after the previous skill succeeds.
- Every step writes the artifact that the next step depends on.
- Any step failure stops the workflow immediately.

## Inputs

- Story text content
- Base project characters, locations, props, and character introductions
- Workflow locale, which selects each internal skill's owned prompt files

## Outputs

- `analysis.characters`
- `analysis.locations`
- `analysis.props`
- `clip.split`
- `clip.screenplay`
- Workflow summary for UI preview and run history

## Approval

- Approval is required before execution.
- Reason: this workflow can overwrite screenplay artifacts and invalidate downstream storyboard or media results.

## Failure Policy

- No step may be skipped.
- No implicit fallback or auto-repair is allowed.
- Any invalid model output, empty required artifact, or broken dependency stops the workflow.

## UI Expectations

- The assistant should show this workflow as one package with nested skill progress.
- The active skill, completed skills, and final screenplay preview should all be visible in the left panel timeline.
