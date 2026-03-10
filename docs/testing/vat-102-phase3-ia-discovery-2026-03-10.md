# VAT-102 — Phase 3 IA Redesign Discovery (Use-case-first)

- Ticket: https://linktovn.atlassian.net/browse/VAT-102
- Epic: https://linktovn.atlassian.net/browse/VAT-85
- Ngày: 2026-03-10
- Phạm vi pass này: **chỉ VAT-102 (discovery/design), không triển khai build phase, không mở rộng VAT-106**.

## 1) Kế thừa baseline từ Phase 1 + Phase 2

### Phase 1 (đã hoàn tất)
- Workspace đã có CTA Manga và create modal có `projectMode=manga`.
- Điều hướng đã hỗ trợ vào script stage với `quickManga=1`.
- Baseline commit đã có trong Epic VAT-85 comments (Phase 1 closure).

### Phase 2 (đã hoàn tất)
- Thuật ngữ/copy Manga đã chuẩn hoá đa ngôn ngữ và đã có QA evidence.
- Baseline docs tham chiếu:
  - `docs/testing/vat-98-phase2-closeout-2026-03-10.md`
  - `docs/testing/vat-101-linguistic-qa-2026-03-10.md`

Kết luận: Phase 3 không làm lại quick wins/copy, chỉ xử lý lớp IA discovery để chuẩn bị redesign build an toàn.

---

## 2) Discovery hiện trạng IA (as-is)

### 2.1 Entry points người dùng hiện có
1. Workspace card CTA Manga (`/workspace`)
2. Create modal selector Story vs Manga (`projectMode`)
3. Deep-link vào workspace project với `?stage=script&quickManga=1`
4. Luồng legacy trong mode `novel-promotion` và API `quick-manga`

### 2.2 Ràng buộc continuity cần giữ
- Không làm gãy route cũ:
  - `/api/novel-promotion/[projectId]/quick-manga`
  - `/api/novel-promotion/[projectId]/quick-manga/history`
- Không phá hành vi query cũ: `quickManga=1`
- Không đổi contract analytics đã có baseline:
  - `workspace_manga_cta_view`
  - `workspace_manga_cta_click`
  - `workspace_manga_conversion`

---

## 3) IA options (use-case-first)

## Option A — Keep technical IA + thêm guide text
- Mô tả: Giữ IA hiện tại, chỉ tăng helper text/tooltips.
- Ưu điểm: effort thấp, rủi ro thấp.
- Nhược điểm: không giải quyết gốc rễ “user chọn sai hành trình theo mục tiêu sáng tác”.

## Option B — Use-case-first shell tại Workspace (khuyến nghị chọn)
- Mô tả: Workspace trở thành điểm chọn hành trình theo mục tiêu:
  - **Write a Story** (General)
  - **Create Manga from Story/Script** (Manga)
- Giữ backend/task routing cũ, chỉ thay lớp IA + navigation semantics ở UI shell.
- Ưu điểm: cải thiện discoverability rõ, không phải re-platform runtime ngay.
- Nhược điểm: cần migration map rõ để tránh đứt flow cũ.

## Option C — Tách mode độc lập ngay lập tức
- Mô tả: tạo mode/app route riêng cho Manga ngay ở pass này.
- Ưu điểm: IA sạch tuyệt đối.
- Nhược điểm: rủi ro regression cao, scope vượt quá VAT-102 discovery.

### Quyết định cuối cùng
**Chọn Option B** cho hướng triển khai tiếp theo.

Lý do:
1. Đạt mục tiêu use-case-first của VAT-102.
2. Tương thích baseline Phase 1 + 2.
3. Không buộc đổi API/runtime ngay trong pass discovery.

---

## 4) Impact map (routing/menu/component affected)

## 4.1 Routing map
| Khu vực | As-is | To-be (theo Option B) | Ghi chú continuity |
|---|---|---|---|
| Workspace landing | `/[locale]/workspace` | Giữ nguyên route, đổi IA shell theo use-case cards | Không đổi URL để tránh gãy bookmark |
| Project entry | `buildProjectEntryUrl(..., 'manga')` => `?stage=script&quickManga=1` | Giữ tương thích; thêm semantic layer “Manga journey” | Query cũ vẫn phải chạy |
| API quick manga | `/api/novel-promotion/[projectId]/quick-manga` | Giữ nguyên trong Phase 3 discovery | Không đổi contract trong VAT-102 |
| API history | `/api/novel-promotion/[projectId]/quick-manga/history` | Giữ nguyên | Không đổi contract |

## 4.2 Menu/IA map
| Vùng UI | As-is | To-be |
|---|---|---|
| Workspace create entry | CTA + modal selector | Hero/use-case switch rõ “General vs Manga” |
| Project creation intent | `entryMode` rải rác | Intent model rõ ràng tại entry shell |
| Stage runtime context | quickManga flag | Giữ flag cũ + bổ sung semantic mapping ở UI layer |

## 4.3 Component impact map
| Component/Module | Ảnh hưởng |
|---|---|
| `src/app/[locale]/workspace/page.tsx` | IA shell, nhóm use-case cards, entry intent copy |
| `src/lib/workspace/project-mode.ts` | Chuẩn hoá intent mapping (không phá compatibility) |
| `src/lib/workspace/quick-manga-entry.ts` | Bảo toàn parser/bridge query cũ |
| `src/lib/workspace/manga-discovery-analytics.ts` | Bổ sung taxonomy event cho IA step (nếu cần ở phase build) |
| `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/...` | Chỉ chạm khi cần gắn intent context; không đổi runtime contract trong discovery |

---

## 5) Migration plan (không gãy flow cũ)

## Giai đoạn M0 — Discovery freeze (pass VAT-102 này)
- Chốt IA decision + impact map + backlog.
- Không đổi runtime/API contract.

## Giai đoạn M1 — UI IA rollout (sau VAT-102)
- Đổi shell entry theo use-case-first ở workspace.
- Giữ nguyên deep-link `quickManga=1` và endpoints quick-manga.
- Add analytics events mới theo chuẩn đặt tên nhưng không xoá event cũ.

## Giai đoạn M2 — Compatibility bridge hardening
- Tạo adapter mapping intent mới -> contract cũ.
- Regression tests cho route/query compatibility.

## Giai đoạn M3 — Deprecation có kiểm soát (nếu cần)
- Chỉ deprecate alias cũ sau khi có đủ telemetry ổn định qua 2 chu kỳ release.

Rollback rule:
- Nếu fail UX/regression, tắt IA mới bằng feature flag và quay về entry shell Phase 1 ngay, không động đến API/runtime.

---

## 6) Validation nhanh (discovery)

Validation proxy trong pass này (không phải production deploy):
1. So khớp baseline artifacts Phase 1/2 từ VAT-85 comments + docs closeout.
2. Đối chiếu route/component hiện hữu trong repo để xác nhận impact map khả thi.
3. Chạy regression test subset cho luồng entry/discovery để đảm bảo continuity không bị phá ở pass discovery.

---

## 7) Implementation backlog đề xuất sau VAT-102 (không thực hiện trong pass này)

1. Workspace IA shell refactor theo Option B.
2. Intent taxonomy cho event analytics IA step.
3. Compatibility adapter + regression suite cho query/route cũ.
4. Feature-flag rollout checklist + rollback playbook.

> Ghi chú scope: backlog này là input cho bước tiếp theo của Phase 3; không triển khai trong VAT-102 pass hiện tại.