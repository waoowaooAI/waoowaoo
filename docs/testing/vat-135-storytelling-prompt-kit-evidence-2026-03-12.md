# VAT-135 — Storytelling prompt kit expansion evidence (2026-03-12)

- Ticket: VAT-135
- Branch: `work/vat-manga-webtoon-lane-20260312`
- Scope pass này: mở VAT-135 ở mức practical, có test guard cho storytelling prompt kit theo panel-role.

## Delivered in this pass

1. Exported story kit catalog for test/audit visibility:
   - `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MangaPanelControls.tsx`
   - change: `const STORY_KITS` -> `export const STORY_KITS`

2. Added unit test for VAT-135 baseline coverage:
   - `tests/unit/workspace/storytelling-prompt-kit.test.ts`

## Assertions covered

- Storytelling kit includes required panel-role presets:
  - `opening`, `setup`, `conflict`, `payoff`, `cliffhanger`
- Each kit maps to valid quick-manga value domains:
  - preset, layout, colorMode in allowed enum sets
  - `styleLockStrength` remains within `[0..1]`

## Verification

Command:

```bash
npx vitest run tests/unit/workspace/storytelling-prompt-kit.test.ts tests/unit/workspace/manga-vocabulary-pass.test.ts tests/unit/workspace/stage-alias.test.ts tests/unit/workspace/stage-navigation-lane.test.ts tests/unit/workspace/webtoon-panel-controls.test.ts
```

Result:
- PASS `24/24`

## Notes

- No merge to default branch.
- No production deploy.
- Đây là bước mở VAT-135 có evidence thật (test-backed), bám thứ tự sau khi đã đẩy VAT-132/133/134 theo trạng thái trung thực.
