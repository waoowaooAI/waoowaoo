# VAT-132 — runtime benchmark evidence (2026-03-14)

## Scope
- Ticket: VAT-132
- Branch: `work/vat-manga-webtoon-lane-20260312`
- Goal for this pass:
  1. prove the 3 required flows can run to first panel on real runtime
  2. generate a benchmark input/summary artifact from real candidate executions
  3. report the benchmark verdict truthfully without overclaim

## Important honesty statement
This pass successfully produced **real candidate executions** for all 3 required flows. However, the benchmark **baseline** values available to the harness remain the bootstrap/sample placeholders introduced in the earlier harness pass, not verified historical production baselines. Therefore:
- execution evidence is real
- benchmark arithmetic is real for the provided input file
- but the comparison baseline is still provisional/bootstrap in this repo state

Because of that, this pass can truthfully claim:
- **3/3 runtime flows reached panel output**
- benchmark summary file was generated from the available paired input
- **VAT-132 benchmark target is still NOT YET / not closable as a >=30% performance claim**

## Flow 1 — manga_quickstart_blank
- Project: `5edecd7a-ac43-43eb-a509-0b8725f9b7d9`
- Episode: `1be6a429-3055-4cb7-8bd5-350b7fa1d2ce`

### Phase 1
- Run: `4f9bb54f-7103-4efe-a6ce-c37ef3637e16`
- Workflow: `story_to_script_run`
- Started: `2026-03-14T16:39:14.599Z`
- Finished: `2026-03-14T16:39:14.657Z`

### Phase 2
- Run: `a73af5db-7ae5-4576-8974-76ad2be24da9`
- Workflow: `script_to_storyboard_run`
- Started: `2026-03-14T16:48:23.217Z`
- Finished: `2026-03-14T16:48:23.237Z`

### Runtime result
- `clips=3`
- `storyboards=3`
- `panels=12`

## Flow 2 — manga_template_story_text
- Project: `4f0194e7-397b-4d58-8acd-bfebf8a34e65`
- Episode: `63e3a84f-2eea-4b19-b7ec-359c91098f72`

### Phase 1
- Run: `f65bda76-d98b-4cbc-93d1-88feb3ef74ed`
- Workflow: `story_to_script_run`
- Started: `2026-03-14T16:55:21.703Z`
- Finished: `2026-03-14T16:55:21.738Z`

### Phase 2
- Run: `d9487366-7c07-4fc0-8a1c-813592412953`
- Workflow: `script_to_storyboard_run`
- Started: `2026-03-14T16:57:27.390Z`
- Finished: `2026-03-14T16:57:27.407Z`

### Runtime result
- `clips=2`
- `storyboards=2`
- `panels=11`

## Flow 3 — manga_legacy_quickmanga_bridge
- Project: `11895b41-c233-49f3-823f-c4d0894c1c20`
- Episode: `9a32f0f4-e57b-488c-9f95-cc1021b29148`

### Legacy repair performed in this pass
1. backfilled `clip.content` for 2 legacy clips that were empty
2. backfilled `episode.novelText` because the legacy episode had `novelText = null`

### Final rerun
- Run: `ae22d877-c8a0-41df-955b-54362eb3a65c`
- Task: `005f957a-9874-4372-a132-37f62e7d581d`
- Workflow: `script_to_storyboard_run`
- Started: `2026-03-14T18:06:41.250Z`
- Finished: `2026-03-14T18:06:41.265Z`

### Runtime result
- `storyboardCount=2`
- `panelCount=8`
- `voiceLineCount=0`
- poll first-panel marker observed during rerun lane

## Benchmark artifacts generated in this pass
- Input: `docs/testing/artifacts/vat-132-runtime-benchmark-2026-03-14/input.json`
- Summary JSON: `docs/testing/artifacts/vat-132-runtime-benchmark-2026-03-14/summary.json`
- Summary Markdown: `docs/testing/artifacts/vat-132-runtime-benchmark-2026-03-14/summary.md`

## Benchmark result from current paired input
Harness output from the current paired input file:
- target improvement: `>= 30%`
- flow count: `3`
- met count: `0/3`
- overall verdict: `NOT YET`
- average improvement: `-2093.99%`

### Why the benchmark result is still NOT YET
- The candidate executions are real and were collected in this pass.
- The baseline values still come from the bootstrap/sample placeholder benchmark pack in repo history.
- Therefore the generated benchmark comparison is mathematically correct for the current paired input file, but it does **not** support claiming performance closure.

## Final verdict for this pass
- **Runtime execution closure:** PASS for 3/3 flows reaching panels.
- **Benchmark >=30% closure:** NOT YET.
- **Ticket wording recommendation:** keep VAT-132 in a truthful non-overclaim state unless product workflow explicitly separates runtime-flow closure from performance-target closure.
