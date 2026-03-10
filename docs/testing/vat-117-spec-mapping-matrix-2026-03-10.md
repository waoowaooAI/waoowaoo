# VAT-117 — [Manga/Webtoon] Spec mapping matrix (final analysis → implementable AC)

- Ticket: https://linktovn.atlassian.net/browse/VAT-117
- Parent story: https://linktovn.atlassian.net/browse/VAT-114
- Date: 2026-03-10
- Strategy: `doc_only`
- Scope: mapping matrix only (không sửa runtime/API/UI code)

## 1) Jira context read-first (đã thực hiện trước khi soạn)

- Issue key: `VAT-117`
- Summary: `[Manga/Webtoon] Spec mapping matrix: từ final analysis -> acceptance criteria implementable`
- Type: `Subtask`
- Parent: `VAT-114`
- Start status: `To Do`
- Labels: `dual-journey`, `manga-webtoon`, `vat-110-reset`

## 2) Input sources (final analysis/spec)

1. `docs/ux/vat-dual-journey-separation-final-analysis-2026-03-10.md`
2. `docs/ux/vat-manga-vs-film-video-journey-spec-2026-03-10.md`

## 3) Scope guard (strictly VAT-117)

Pass này chỉ tạo **ma trận mapping từ kết luận final analysis sang AC có thể triển khai** cho VAT-114 planning.

Không làm trong pass VAT-117:
- Không refactor code runtime/worker.
- Không thay route/API contract đang chạy.
- Không đổi analytics implementation trong code.
- Không deploy.

## 4) Mapping matrix: final analysis → implementable acceptance criteria

| ID | Final analysis / spec statement | Implementable AC (ready for execution) | Verification signal |
|---|---|---|---|
| M1 | Phải tách rõ 2 product journeys: `Create Video/Film` vs `Create Manga/Webtoon`. | Workspace entry hiển thị 2 primary journeys ngang hàng (Manga, Film/Video) trong 1 màn hình đầu; copy/CTA riêng cho từng journey. | UX QA screenshot checklist + responsive pass (mobile/desktop). |
| M2 | Không dùng framing “Manga là biến thể trong flow Video/Film”. | Create flow có bước chọn `journeyType` bắt buộc trước bước chọn template. | Unit test/contract test xác nhận payload create chứa `journeyType`. |
| M3 | Cần single intent source-of-truth. | Định nghĩa contract intent chuẩn gồm `journeyType` (`manga_webtoon` \| `film_video`) và `entryIntent`; không suy luận intent từ query cũ. | Type/contract guard pass + integration create request assertions. |
| M4 | Giữ compatibility ngắn hạn, không phá continuity. | Legacy deep-link `quickManga=1` vẫn vào đúng Manga context qua adapter/parser; không regression cho link/bookmark cũ. | Regression test cho route legacy + smoke manual deep-link. |
| M5 | Runtime/API bridge cũ được giữ trong giai đoạn chuyển tiếp. | Adapter map new intent -> legacy runtime fields (`projectMode`, quick manga bridge) mà không đổi API quick-manga/history hiện hữu. | API contract test không đổi schema phản hồi quick-manga/history. |
| M6 | Analytics phải so sánh được 2 journey cân bằng. | Funnel taxonomy chuẩn hóa có các event: `workspace_journey_selected`, `workspace_template_selected`, `workspace_project_created`, `workspace_first_generation_*`; event chứa bắt buộc `journeyType`, `entryIntent`, `templateId`, `locale`, `projectId`. | Telemetry schema validation + sample event audit log. |
| M7 | Migration theo phase + gate + rollback. | Có rollout plan M0→M4 với feature flag, KPI gate >=2 release cycles trước deprecate event cũ, và rollback runbook rõ trigger/hành động. | Checklist sign-off (PM+Eng) + rollback drill evidence. |
| M8 | Không tách runtime sâu ngay pass đầu. | Sprint implementation đầu chỉ tách lớp UX/intent/analytics adapter; runtime decouple sâu được đánh dấu optional phase sau KPI gate. | Jira plan có explicit out-of-scope runtime decouple for initial release. |
| M9 | Onboarding/template cần tách namespace theo journey. | Template gallery phân nhóm theo journey (`manga` vs `film_video`) với copy mục tiêu đầu ra riêng, không dùng wording generic chung. | Content QA checklist + i18n key audit theo journey namespace. |
| M10 | SoT transition cần observable và an toàn. | Trong transition period, logging chứa cả new fields (`journeyType`, `entryIntent`) và legacy fields để đối soát continuity. | Log sample + dashboard mapping old/new dimensions. |

## 5) Definition of Done đề xuất cho VAT-117

- [x] Jira context đọc trước khi thực hiện.
- [x] Có mapping matrix trực tiếp từ final analysis/spec sang AC implementable.
- [x] Mỗi AC có tín hiệu verify rõ ràng.
- [x] Scope doc_only, không đụng code runtime.

## 6) Handover note cho VAT-114 execution

VAT-117 artifact này là cầu nối từ phân tích -> backlog execution:
- Dùng M1..M10 làm checklist decomposition thành sub-tasks implementation.
- Ưu tiên triển khai theo nhịp: UX split + intent contract + compatibility adapter + telemetry gate.
- Giữ nguyên nguyên tắc: không phá legacy continuity trong phase đầu.
