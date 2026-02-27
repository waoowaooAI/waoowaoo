# Behavior Test Guideline

## Goal
- Treat tests as product contracts: input -> execution -> result.
- Block regressions on real outcomes (payload, DB write fields, returned contract, lifecycle events).

## Mandatory Rules
- Do not use `toHaveBeenCalled()` as the only assertion.
- Every test must assert at least one concrete business value.
- Every worker handler must include:
  - failure path
  - success path
  - key branch path
- One bug fix must add at least one regression test.

## Mock Rules
- Must mock: database, AI providers, storage, external HTTP.
- Must not mock: the function under test, business constants.
- Avoid self-fulfilling mocks (`mock return X` then only assert returned X).

## Required Layers
- `tests/unit/helpers`: payload parsing and helper decisions.
- `tests/integration/api/contract`: route-level contracts and auth/validation.
- `tests/unit/worker`: worker branch + persistence assertions.
- `tests/integration/chain`: queue payload handoff and worker consumption behavior.
- `tests/unit/optimistic`: SSE and target-state UI consistency.

## Execution Commands
- `npm run test:behavior:unit`
- `npm run test:behavior:api`
- `npm run test:behavior:chain`
- `npm run test:behavior:guards`
- `npm run test:behavior:full`

## Merge Gate
- Behavior guards must pass.
- New route/task type must be reflected in catalogs/matrices.
- Regression changes without behavior tests are not complete.
