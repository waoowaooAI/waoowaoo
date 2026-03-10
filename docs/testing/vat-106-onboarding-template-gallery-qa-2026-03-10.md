# VAT-106 — Onboarding theo mode + Template Gallery + Terminology Sync

- Ticket: https://linktovn.atlassian.net/browse/VAT-106
- Epic: https://linktovn.atlassian.net/browse/VAT-85
- Subtasks:
  - VAT-107: https://linktovn.atlassian.net/browse/VAT-107
  - VAT-108: https://linktovn.atlassian.net/browse/VAT-108
  - VAT-109: https://linktovn.atlassian.net/browse/VAT-109
- Scope pass này: chỉ build onboarding theo mode trong create modal workspace, thêm starter template gallery, và QA terminology cho các surface mới của VAT-106.

## 1) Jira context / phase mapping

- VAT-85 mô tả roadmap:
  - Phase 1: Quick Wins UI
  - Phase 2: Copy & Localization
  - Phase 3: Design System
  - Phase 4: Rollout & Measure
- VAT-102 (`[Redesign Discovery]`) đã Done và đóng vai trò discovery/design input cho phase build tiếp theo.
- VAT-106 (`[Redesign Build] Onboarding theo mode + Template Gallery + Terminology Sync toàn hệ`) hiện là story kế tiếp trực tiếp sau VAT-102 trong chuỗi redesign của epic VAT-85.

Kết luận mapping:
- **VAT-106 là next implementation story hợp lệ sau VAT-102** theo chuỗi redesign/build.
- Tuy nhiên, theo mô tả gốc của epic VAT-85 thì VAT-106 là **build phase kế tiếp của redesign**, còn “Phase 4” ở cấp epic được mô tả là **Rollout & Measure**. Vì vậy pass này thực chất là **bắt đầu branch VAT-106 sau VAT-102**, nhưng có **lệch naming phase** nếu gọi VAT-106 là rollout phase thuần túy.

## 2) Phạm vi đã thực hiện

### VAT-107 — Onboarding theo mode
- Mở rộng create modal của workspace thành onboarding nhẹ theo mode `story | manga`.
- Khi đổi mode, UI reset danh sách template theo mode tương ứng.
- Nếu user chưa nhập tên project, cho phép dùng tên fallback từ starter template.

### VAT-108 — Template Gallery cho Manga starter flows
- Thêm `src/lib/workspace/onboarding-templates.ts` làm source of truth cho starter templates.
- Cung cấp 4 Manga starter templates:
  - Action Battle
  - Romance School
  - Fantasy Quest
  - Comedy 4-koma
- Cung cấp thêm 3 Story starter templates để onboarding theo mode không bị lệch trải nghiệm giữa 2 lane.

### VAT-109 — Terminology sync + QA
- Bổ sung copy đa ngôn ngữ cho template gallery ở `messages/{en,vi,zh,ko}/workspace.json`.
- Giữ thuật ngữ user-facing nhất quán dùng `Manga` trên label + description của entry mode và starter templates.
- Thêm regression tests xác minh key i18n và terminology tồn tại trên cả 4 locale.

## 3) Files changed

- `src/app/[locale]/workspace/page.tsx`
- `src/lib/workspace/onboarding-templates.ts`
- `messages/en/workspace.json`
- `messages/vi/workspace.json`
- `messages/zh/workspace.json`
- `messages/ko/workspace.json`
- `tests/unit/workspace/manga-onboarding-template-gallery.test.ts`

## 4) Verify / test

Đã chạy:

```bash
npx vitest run \
  tests/unit/helpers/workspace-project-mode.test.ts \
  tests/unit/helpers/manga-discovery-analytics.test.ts \
  tests/unit/workspace/manga-entrypoint-i18n.test.ts \
  tests/unit/workspace/manga-onboarding-template-gallery.test.ts
```

Kết quả: **PASS 13 tests / 4 files**

Đã chạy lint scope:

```bash
npm run lint -- 'src/app/[locale]/workspace/page.tsx' src/lib/workspace/onboarding-templates.ts tests/unit/workspace/manga-onboarding-template-gallery.test.ts
```

Kết quả: **PASS**

## 5) Non-scope / guardrails giữ nguyên

- Không đổi API contract `/api/projects` ngoài việc tiếp tục dùng `projectMode` đã có từ baseline phase trước.
- Không đổi runtime editor/quick-manga API.
- Không deploy production.
