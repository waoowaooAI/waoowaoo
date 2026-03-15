VAT-132 runtime benchmark update (2026-03-14)

Summary
- Completed real runtime execution for all 3 required VAT-132 flows through panel output.
- Generated benchmark artifacts from a paired input file using the existing harness.
- Runtime-flow closure is now evidenced, but the >=30% benchmark target is still NOT YET because the baseline side of the paired input remains bootstrap/sample in current repo history.

3/3 runtime flows reached panel output

1) manga_quickstart_blank
- project `5edecd7a-ac43-43eb-a509-0b8725f9b7d9`
- episode `1be6a429-3055-4cb7-8bd5-350b7fa1d2ce`
- story_to_script run `4f9bb54f-7103-4efe-a6ce-c37ef3637e16`
- script_to_storyboard run `a73af5db-7ae5-4576-8974-76ad2be24da9`
- DB result: `clips=3`, `storyboards=3`, `panels=12`

2) manga_template_story_text
- project `4f0194e7-397b-4d58-8acd-bfebf8a34e65`
- episode `63e3a84f-2eea-4b19-b7ec-359c91098f72`
- story_to_script run `f65bda76-d98b-4cbc-93d1-88feb3ef74ed`
- script_to_storyboard run `d9487366-7c07-4fc0-8a1c-813592412953`
- DB result: `clips=2`, `storyboards=2`, `panels=11`

3) manga_legacy_quickmanga_bridge
- project `11895b41-c233-49f3-823f-c4d0894c1c20`
- episode `9a32f0f4-e57b-488c-9f95-cc1021b29148`
- repaired legacy data in this pass:
  - backfilled 2 empty `clip.content` values
  - backfilled missing `episode.novelText`
- final rerun `ae22d877-c8a0-41df-955b-54362eb3a65c`
- DB/result: `storyboardCount=2`, `panelCount=8`

Artifacts
- `docs/testing/vat-132-runtime-benchmark-evidence-2026-03-14.md`
- `docs/testing/artifacts/vat-132-runtime-benchmark-2026-03-14/input.json`
- `docs/testing/artifacts/vat-132-runtime-benchmark-2026-03-14/summary.json`
- `docs/testing/artifacts/vat-132-runtime-benchmark-2026-03-14/summary.md`

Benchmark result from current paired input
- target improvement: `>= 30%`
- met count: `0/3`
- overall verdict: `NOT YET`
- average improvement: `-2093.99%`

Honesty note
- Candidate executions in this pass are real.
- The paired baseline values currently used by the harness remain bootstrap/sample placeholders from the earlier harness bootstrap pack, not verified historical production baselines.
- Therefore this pass truthfully proves runtime-flow execution closure, but does not justify a >=30% performance closure claim.

Recommended status wording
- Runtime-flow execution evidence: PASS (3/3)
- Benchmark target >=30%: NOT YET
- Keep VAT-132 in a truthful non-overclaim state unless workflow policy explicitly separates runtime closure from performance closure.
