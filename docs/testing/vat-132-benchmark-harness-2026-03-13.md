# VAT-132 — Benchmark harness bootstrap (2026-03-13)

- Ticket: VAT-132
- Epic lane: VAT-131 P2
- Purpose: bootstrap an execution-level harness for the missing `time-to-first-panel` acceptance proof.
- Scope in this pass: add deterministic benchmark helpers + CLI summary generator + sample artifact template. No deploy.

## 1) Why this pass exists

Previous VAT-132 closure notes correctly identified the core blocker:
- no benchmark harness existed to measure `time-to-first-panel`
- no standardized summary artifact existed to compare baseline vs candidate runs

This pass addresses the harness gap first so later runs can produce real evidence instead of narrative-only blocker notes.

## 2) Deliverables added

1. `src/lib/workspace/vat-132-benchmark.ts`
   - benchmark domain model
   - time-to-first-panel calculation
   - baseline/candidate comparison
   - PASS/FAIL summary logic for the >=30% target
   - markdown renderer for evidence output

2. `scripts/vat-132-time-to-first-panel-benchmark.ts`
   - CLI that reads paired benchmark runs from JSON
   - outputs JSON summary
   - optionally writes markdown evidence file

3. `tests/unit/helpers/vat-132-benchmark.test.ts`
   - verifies calculation, target comparison, summary, markdown rendering

4. `docs/testing/artifacts/vat-132-benchmark-harness-2026-03-13/sample-input.json`
   - template input for the next execution pass

## 3) Intended next-step usage

Example command for the next evidence pass:

```bash
npx tsx scripts/vat-132-time-to-first-panel-benchmark.ts \
  --input docs/testing/artifacts/vat-132-benchmark-harness-2026-03-13/sample-input.json \
  --output-json docs/testing/artifacts/vat-132-benchmark-harness-2026-03-13/summary.json \
  --output-md docs/testing/artifacts/vat-132-benchmark-harness-2026-03-13/summary.md
```

## 4) Important limitation (still true)

This pass **does not claim VAT-132 benchmark AC is closed yet**.
It only creates the missing harness so the next run can collect real baseline/candidate timings for the 3 required flows.

## 5) Next execution target

Collect paired timing evidence for:
1. `manga_quickstart_blank`
2. `manga_template_story_text`
3. `manga_legacy_quickmanga_bridge`

Only after those paired runs exist can VAT-132 truthfully claim whether the >=30% requirement passes or fails.
